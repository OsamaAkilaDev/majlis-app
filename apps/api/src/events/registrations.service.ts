import { Injectable } from '@nestjs/common';
import type {
  ClubStatus,
  EventStatus,
  MyRegistrationListQuery,
  MyRegistrationList,
  RegisterBody,
  Registration,
  RegistrationListQuery,
  RegistrationList,
} from '@majlis/contracts';
import { AuditService } from '../audit/audit.service';
import type { PlatformRole } from '../auth/permissions';
import { WITH_USER } from '../common/with-user';
import { assertAcceptsNewActivity } from '../clubs/club-status';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnprocessableError,
} from '../common/problem/domain-error';
import { isUniqueViolation } from '../common/prisma-constraint';
import type { EventRegistration as RegistrationRow } from '../generated/prisma/client';
import { TransactionHost } from '../prisma/transaction.host';
import { EventLifecycleService } from './event-lifecycle.service';
import { NotificationService } from '../notifications/notification.service';
import { EVENT_SUMMARY_SELECT, toEventSummary } from './events.service';
import { transitionRegistration } from './registration-status';
import { promoteFromWaitlist } from './waitlist';

// Statuses that still hold a place.
const OPEN = { status: { not: 'CANCELLED' } } as const;

interface Actor {
  id: string;
  platformRole: PlatformRole;
  fullName: string;
  email: string;
}

interface Person {
  fullName: string;
  email: string;
}

// Club status rides on the lock statement so no extra round trip holds the row lock longer.
interface LockedEvent {
  id: string;
  clubId: string;
  title: string;
  clubStatus: ClubStatus;
  status: EventStatus;
  capacity: number;
  confirmedCount: number;
  waitlistEnabled: boolean;
  requiresClubMembership: boolean;
  registrationOpensAt: Date;
  registrationClosesAt: Date;
}

function toRegistration(row: RegistrationRow, person: Person): Registration {
  return {
    id: row.id,
    eventId: row.eventId,
    userId: row.userId,
    userFullName: person.fullName,
    userEmail: person.email,
    status: row.status,
    waitlistPosition: row.waitlistPosition,
    registeredAt: row.registeredAt.toISOString(),
    promotedAt: row.promotedAt?.toISOString() ?? null,
    source: row.source,
  };
}

@Injectable()
export class RegistrationsService {
  constructor(
    private readonly host: TransactionHost,
    private readonly audit: AuditService,
    private readonly lifecycle: EventLifecycleService,
    private readonly notifications: NotificationService,
  ) {}

  /** The event row lock serialises the last seat; the CHECK constraint is the backstop. */
  async register(actor: Actor, eventId: string, body: RegisterBody): Promise<Registration> {
    const override = body.userId !== undefined;
    if (override && actor.platformRole !== 'ADMIN') {
      throw new ForbiddenError('Only an administrator may register someone else.');
    }
    const userId = body.userId ?? actor.id;

    // Before our transaction, so a refusal below does not roll the advance back.
    await this.lifecycle.advance(eventId);

    try {
      const row = await this.host.run(async () => {
        const event = await this.lockEvent(eventId);

        // Idempotent, so it precedes the window checks.
        const existing = await this.findOpen(eventId, userId);
        if (existing) return existing;

        this.assertOpenForRegistration(event);
        assertAcceptsNewActivity(event.clubStatus);

        // An override skips eligibility only, never capacity.
        if (!override && event.requiresClubMembership) {
          const membership = await this.host.tx.clubMembership.findFirst({
            where: { clubId: event.clubId, userId, status: 'ACTIVE' },
          });
          if (!membership) {
            throw new UnprocessableError('You must be a member of that club to register for this event.');
          }
        }

        const seatFree = event.confirmedCount < event.capacity;
        if (!seatFree && !event.waitlistEnabled) {
          throw new ConflictError('That event is full and has no waitlist.');
        }

        const row = await this.host.tx.eventRegistration.create({
          data: {
            eventId,
            userId,
            status: seatFree ? 'CONFIRMED' : 'WAITLISTED',
            waitlistPosition: seatFree ? null : await this.nextWaitlistPosition(eventId),
            source: override ? 'ADMIN_OVERRIDE' : 'SELF',
            overrideReason: body.overrideReason ?? null,
          },
        });

        if (seatFree) {
          await this.host.tx.event.update({
            where: { id: eventId },
            data: { confirmedCount: { increment: 1 } },
          });
        }

        await this.audit.record({
          action: override ? 'event.registration_overridden' : 'event.registered',
          entityType: 'EventRegistration',
          entityId: row.id,
          reason: body.overrideReason,
          actorUserId: actor.id,
          after: { eventId, userId, status: row.status, waitlistPosition: row.waitlistPosition },
        });

        // Same transaction as the seat, so a rollback leaves no notification behind.
        await this.notifications.record({
          userId,
          type: seatFree ? 'registration.confirmed' : 'registration.waitlisted',
          subject: row.id,
          payload: {
            registrationId: row.id,
            eventId,
            eventTitle: event.title,
            status: row.status,
            waitlistPosition: row.waitlistPosition,
          },
        });

        return row;
      });

      return toRegistration(row, await this.person(actor, userId));
    } catch (e) {
      // The unique index caught a race the lock did not: answer with the row that won.
      if (isUniqueViolation(e, 'one_open_per_user')) {
        const existing = await this.findOpen(eventId, userId);
        if (existing) return toRegistration(existing, await this.person(actor, userId));
      }
      throw e;
    }
  }

  private async person(actor: Actor, userId: string): Promise<Person> {
    if (userId === actor.id) return { fullName: actor.fullName, email: actor.email };
    return this.host.tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { fullName: true, email: true },
    });
  }

  async cancel(actor: Actor, eventId: string): Promise<void> {
    await this.lifecycle.advance(eventId);

    return this.host.run(async () => {
      const event = await this.lockEvent(eventId);
      if (!['PUBLISHED', 'REGISTRATION_CLOSED', 'CANCELLED'].includes(event.status)) {
        throw new UnprocessableError('That event no longer accepts registration changes.');
      }

      const existing = await this.host.tx.eventRegistration.findFirst({
        where: { eventId, userId: actor.id, status: { in: ['CONFIRMED', 'WAITLISTED'] } },
      });
      if (!existing) throw new NotFoundError('You are not registered for that event.');

      await transitionRegistration(this.host, existing.id, existing.status, 'CANCELLED', {
        cancelledAt: new Date(),
        cancelledById: actor.id,
      });

      await this.audit.record({
        action: 'event.registration_cancelled',
        entityType: 'EventRegistration',
        entityId: existing.id,
        actorUserId: actor.id,
        before: { status: existing.status },
        after: { status: 'CANCELLED' },
      });

      // Only a confirmed seat frees one; promoting on a waitlist cancel would oversell.
      if (existing.status === 'CONFIRMED') {
        await this.host.tx.event.update({
          where: { id: eventId },
          data: { confirmedCount: { decrement: 1 } },
        });
        if (event.status !== 'CANCELLED') {
          await promoteFromWaitlist(this.host, this.audit, this.notifications, eventId, 1);
        }
      }
    });
  }

  async roster(eventId: string, query: RegistrationListQuery): Promise<RegistrationList> {
    const rows = await this.host.tx.eventRegistration.findMany({
      where: { eventId, ...(query.status ? { status: query.status } : {}) },
      orderBy: { id: 'asc' },
      include: WITH_USER,
    });

    return { items: rows.map((row) => toRegistration(row, row.user)) };
  }

  // Self-scoped by `userId: actor.id`, which is why the route carries no @RequirePermission.
  async mine(actor: Actor, query: MyRegistrationListQuery): Promise<MyRegistrationList> {
    // Split on the event's end, not its start: a running event has not passed.
    const now = new Date();
    const window =
      query.past === undefined
        ? {}
        : { event: query.past ? { endsAt: { lt: now } } : { endsAt: { gte: now } } };

    const rows = await this.host.tx.eventRegistration.findMany({
      where: { userId: actor.id, ...OPEN, ...window },
      orderBy: { id: 'asc' },
      include: { event: { select: EVENT_SUMMARY_SELECT } },
    });

    return {
      items: rows.map((r) => ({
        id: r.id,
        status: r.status,
        waitlistPosition: r.waitlistPosition,
        registeredAt: r.registeredAt.toISOString(),
        event: toEventSummary(r.event),
      })),
    };
  }

  /** Every registration write serialises on this lock. */
  private async lockEvent(eventId: string): Promise<LockedEvent> {
    const rows = await this.host.tx.$queryRaw<LockedEvent[]>`
      SELECT e."id",
             e."club_id" AS "clubId",
             e."title",
             e."status"::text AS "status",
             e."capacity",
             e."confirmed_count" AS "confirmedCount",
             e."waitlist_enabled" AS "waitlistEnabled",
             e."requires_club_membership" AS "requiresClubMembership",
             e."registration_opens_at" AS "registrationOpensAt",
             e."registration_closes_at" AS "registrationClosesAt",
             c."status"::text AS "clubStatus"
      FROM "event" e JOIN "club" c ON c."id" = e."club_id"
      WHERE e."id" = ${eventId}::uuid
      FOR UPDATE OF e`;

    const event = rows[0];
    if (!event) throw new NotFoundError('No such event.');
    return event;
  }

  private assertOpenForRegistration(event: LockedEvent): void {
    // A draft must be indistinguishable from an event that does not exist.
    if (event.status === 'DRAFT') throw new NotFoundError('No such event.');
    if (event.status === 'CANCELLED') throw new UnprocessableError('That event was cancelled.');
    if (event.status !== 'PUBLISHED') {
      throw new UnprocessableError('Registration for that event has closed.');
    }

    const now = new Date();
    if (now < event.registrationOpensAt) {
      throw new UnprocessableError('Registration for that event has not opened yet.');
    }
    if (now >= event.registrationClosesAt) {
      throw new UnprocessableError('Registration for that event has closed.');
    }
  }

  // No `include`: Prisma runs the relation query even when nothing matches.
  private async findOpen(eventId: string, userId: string): Promise<RegistrationRow | null> {
    return this.host.tx.eventRegistration.findFirst({ where: { eventId, userId, ...OPEN } });
  }

  // Safe only under the event row lock.
  private async nextWaitlistPosition(eventId: string): Promise<number> {
    const { _max } = await this.host.tx.eventRegistration.aggregate({
      _max: { waitlistPosition: true },
      where: { eventId, status: 'WAITLISTED' },
    });
    return (_max.waitlistPosition ?? 0) + 1;
  }
}

import { Injectable } from '@nestjs/common';
import { certificateFieldsComplete } from '@majlis/contracts';
import type {
  CancelEventBody,
  CreateEventBody,
  EventDetail,
  EventListQuery,
  EventStatus,
  EventList,
  EventSummary,
  NewEventUpload,
  PatchEventBody,
  PublishEventBody,
  SignedUpload,
} from '@majlis/contracts';
import { v7 as uuidv7 } from 'uuid';
import { AuditService } from '../audit/audit.service';
import { EVENT_FIELDS, assertFieldsAllowed, overrideReasonFor } from '../auth/field-permissions';
import { clubOverrideReason } from '../auth/override';
import type { Actor } from '../auth/permissions';
import { resolveClubFacts, resolveEventFacts } from '../auth/permissions.guard';
import { assertAcceptsNewActivity } from '../clubs/club-status';
import { loadClub } from '../clubs/load-club';
import { ClubsService } from '../clubs/clubs.service';
import { deriveSlug, uniqueSlug } from '../clubs/slug';
import { ConflictError, NotFoundError, UnprocessableError } from '../common/problem/domain-error';
import { conflictOn } from '../common/prisma-constraint';
import type { Prisma, Event as EventRow } from '../generated/prisma/client';
import { TransactionHost } from '../prisma/transaction.host';
import { EventLifecycleService } from './event-lifecycle.service';
import { NotificationService } from '../notifications/notification.service';
import { assertEventAcceptsEdits, assertTransition, dueStatus } from './event-status';
import { loadEvent, type EventWithClub, WITH_CLUB } from './load-event';
import { promoteFromWaitlist } from './waitlist';

// Exactly what `toSummary` reads, so list pages skip the long `description` column.
const SUMMARY_SELECT = {
  id: true,
  clubId: true,
  title: true,
  slug: true,
  summary: true,
  eventType: true,
  audience: true,
  venue: true,
  onlineUrl: true,
  bannerUrl: true,
  timezone: true,
  startsAt: true,
  endsAt: true,
  registrationOpensAt: true,
  registrationClosesAt: true,
  capacity: true,
  confirmedCount: true,
  waitlistEnabled: true,
  requiresClubMembership: true,
  status: true,
  club: { select: { name: true, slug: true, logoUrl: true } },
} as const;

type EventSummaryRow = Prisma.EventGetPayload<{ select: typeof SUMMARY_SELECT }>;

// Derived from EVENT_FIELDS so a permitted field can never silently write nothing.
const PATCHABLE = Object.keys(EVENT_FIELDS).filter((k) => k !== 'posterUploaded');

// The fields deciding whether or where a student can turn up. A retitle notifies nobody.
const MATERIAL_FIELDS = ['startsAt', 'endsAt', 'venue', 'onlineUrl', 'timezone'] as const;

// A key equal to what is stored is not a change: re-saving a form must not notify anyone.
function materialChanges(before: EventRow, data: Record<string, unknown>): string[] {
  return MATERIAL_FIELDS.filter((key) => {
    const next = data[key];
    if (next === undefined) return false;
    const prev = before[key];
    if (prev instanceof Date) return new Date(next as string).getTime() !== prev.getTime();
    return next !== prev;
  });
}

interface Windows {
  startsAt: Date;
  endsAt: Date;
  registrationOpensAt: Date;
  registrationClosesAt: Date;
}

/** Checked on the merged row. */
function assertWindows(w: Windows): void {
  if (w.startsAt > w.endsAt) throw new UnprocessableError('An event must end after it starts.');
}

/** Checked on the merged row: snapshot columns mean a certificate issued without a signatory stays that way. */
function assertCertificateFields(row: {
  certificateEnabled: boolean;
  certificateTitle: string | null;
  certificateSignatory: string | null;
}): void {
  if (certificateFieldsComplete(row)) return;
  throw new UnprocessableError(
    'A certificate needs a title and a signatory before it can be enabled.',
  );
}

// Renders `dueStatus`, not the stored status: a list read must not write, and stored lags due.
function toSummary(row: EventSummaryRow, now = new Date()): EventSummary {
  return {
    id: row.id,
    clubId: row.clubId,
    clubName: row.club.name,
    clubSlug: row.club.slug,
    clubLogoUrl: row.club.logoUrl,
    title: row.title,
    slug: row.slug,
    summary: row.summary,
    eventType: row.eventType,
    audience: row.audience,
    venue: row.venue,
    onlineUrl: row.onlineUrl,
    bannerUrl: row.bannerUrl,
    timezone: row.timezone,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    registrationOpensAt: row.registrationOpensAt.toISOString(),
    registrationClosesAt: row.registrationClosesAt.toISOString(),
    capacity: row.capacity,
    confirmedCount: row.confirmedCount,
    waitlistEnabled: row.waitlistEnabled,
    requiresClubMembership: row.requiresClubMembership,
    status: dueStatus(row, now),
  };
}

export { toSummary as toEventSummary, SUMMARY_SELECT as EVENT_SUMMARY_SELECT };

const mapWriteError = conflictOn({ slug: 'That club already has an event with that slug.' });

@Injectable()
export class EventsService {
  constructor(
    private readonly host: TransactionHost,
    private readonly audit: AuditService,
    private readonly lifecycle: EventLifecycleService,
    private readonly clubs: ClubsService,
    private readonly notifications: NotificationService,
  ) {}

  // Mints the event id up front, so the poster's object path exists before the event does.
  async mintPosterUpload(): Promise<NewEventUpload> {
    const eventId = uuidv7();
    return { eventId, ...(await this.clubs.mintEditUpload(eventId, 'event-poster')) };
  }

  /** Gated on the `posterUploaded` field permission, since `event:edit` admits every club role. */
  async mintEditUpload(actor: Actor, eventId: string): Promise<SignedUpload> {
    return this.host.run(async () => {
      const event = await loadEvent(this.host, eventId);
      assertEventAcceptsEdits(event);

      const { clubRoles } = await resolveClubFacts(this.host, actor.id, event.clubId);
      assertFieldsAllowed({ posterUploaded: true }, EVENT_FIELDS, {
        platformRole: actor.platformRole,
        clubRoles,
      });

      const upload = await this.clubs.mintEditUpload(eventId, 'event-poster');

      await this.audit.record({
        action: 'event.upload_url_minted',
        entityType: 'Event',
        entityId: eventId,
        actorUserId: actor.id,
        after: { kind: 'event-poster', path: upload.path },
      });

      return upload;
    });
  }

  async create(actor: Actor, clubId: string, body: CreateEventBody): Promise<EventDetail> {
    return this.host.run(async () => {
      await loadClub(this.host, clubId, assertAcceptsNewActivity);

      const reason = await clubOverrideReason(this.host, actor, clubId, body.overrideReason);

      const windows: Windows = {
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
        registrationOpensAt: new Date(body.registrationOpensAt),
        registrationClosesAt: new Date(body.registrationClosesAt),
      };
      assertWindows(windows);
      assertCertificateFields({
        certificateEnabled: body.certificateEnabled,
        certificateTitle: body.certificateTitle ?? null,
        certificateSignatory: body.certificateSignatory ?? null,
      });

      const bannerUrl = body.posterUploaded
        ? await this.clubs.verifyUpload('event-poster', body.eventId)
        : null;

      // Unique per club, not globally.
      const slug = await uniqueSlug(deriveSlug(body.title), (s) =>
        this.host.tx.event.count({ where: { clubId, slug: s } }).then((n) => n > 0),
      );

      const row = await this.host.tx.event
        .create({
          data: {
            id: body.eventId,
            clubId,
            title: body.title,
            slug,
            summary: body.summary,
            description: body.description,
            eventType: body.eventType,
            audience: body.audience,
            venue: body.venue ?? null,
            onlineUrl: body.onlineUrl ?? null,
            bannerUrl,
            timezone: body.timezone,
            ...windows,
            capacity: body.capacity,
            waitlistEnabled: body.waitlistEnabled,
            requiresClubMembership: body.requiresClubMembership,
            certificateEnabled: body.certificateEnabled,
            certificateTitle: body.certificateTitle ?? null,
            certificateSignatory: body.certificateSignatory ?? null,
            attendancePolicy: body.attendancePolicy,
            createdById: actor.id,
          },
          include: WITH_CLUB,
        })
        .catch(mapWriteError);

      await this.audit.record({
        action: 'event.created',
        entityType: 'Event',
        entityId: row.id,
        actorUserId: actor.id,
        reason,
        after: { clubId, title: row.title, slug: row.slug, capacity: row.capacity },
      });

      return this.toDetail(actor, row);
    });
  }

  // `?status=` filters on the stored value, so a row not yet advanced matches its old status.
  async list(actor: Actor, query: EventListQuery): Promise<EventList> {
    const filters: Prisma.EventWhereInput = {
      ...(query.clubId ? { clubId: query.clubId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.upcoming ? { endsAt: { gte: new Date() } } : {}),
    };
    const visible = this.visibilityFilter(actor);
    const mine = query.fromMyClubs ? await this.myClubsFilter(actor) : null;
    const and = [filters, visible, mine].filter(
      (f): f is Prisma.EventWhereInput => f !== null && f !== undefined,
    );

    const rows = await this.host.tx.event.findMany({
      where: { AND: and },
      orderBy: { id: query.direction ?? 'asc' },
      select: SUMMARY_SELECT,
    });

    const now = new Date();
    return { items: rows.map((row) => toSummary(row, now)) };
  }

  async detail(actor: Actor, eventId: string): Promise<EventDetail> {
    await this.lifecycle.advance(eventId);
    return this.readDetail(actor, eventId);
  }

  private async readDetail(actor: Actor, eventId: string): Promise<EventDetail> {
    const row = await loadEvent(this.host, eventId);

    const detail = await this.toDetail(actor, row);

    // 404, not 403: admitting the draft exists is itself the leak.
    if (
      row.status === 'DRAFT' &&
      actor.platformRole !== 'ADMIN' &&
      detail.viewerClubRoles.length === 0 &&
      detail.viewerResponsibilities.length === 0
    ) {
      throw new NotFoundError('No such event.');
    }
    return detail;
  }

  // Excludes events already registered for server-side: client de-duplication breaks past page one.
  private async myClubsFilter(actor: Actor): Promise<Prisma.EventWhereInput> {
    const memberships = await this.host.tx.clubMembership.findMany({
      where: { userId: actor.id, status: 'ACTIVE' },
      select: { clubId: true },
    });

    return {
      clubId: { in: memberships.map((m) => m.clubId) },
      registrations: { none: { userId: actor.id, status: { not: 'CANCELLED' } } },
    };
  }

  // A DRAFT is visible only to the club's officers and this event's assignees.
  private visibilityFilter(actor: Actor): Prisma.EventWhereInput | null {
    if (actor.platformRole === 'ADMIN') return null;

    return {
      OR: [
        { status: { not: 'DRAFT' } },
        { club: { appointments: { some: { userId: actor.id, status: 'ACTIVE' } } } },
        { assignments: { some: { userId: actor.id } } },
      ],
    };
  }

  private async toDetail(actor: Actor, row: EventWithClub): Promise<EventDetail> {
    const registration = await this.host.tx.eventRegistration.findFirst({
      where: { eventId: row.id, userId: actor.id, status: { not: 'CANCELLED' } },
    });
    const { clubRoles } = await resolveClubFacts(this.host, actor.id, row.clubId);
    const { eventResponsibilities } = await resolveEventFacts(this.host, actor.id, row.id);

    return {
      ...toSummary(row),
      description: row.description,
      certificateEnabled: row.certificateEnabled,
      certificateTitle: row.certificateTitle,
      certificateSignatory: row.certificateSignatory,
      attendancePolicy: row.attendancePolicy,
      cancelledReason: row.cancelledReason,
      viewerRegistrationStatus: registration?.status ?? null,
      viewerWaitlistPosition: registration?.waitlistPosition ?? null,
      viewerClubRoles: clubRoles,
      viewerResponsibilities: eventResponsibilities,
    };
  }

  async update(actor: Actor, eventId: string, body: PatchEventBody): Promise<EventDetail> {
    await this.lifecycle.advance(eventId);

    return this.host.run(async () => {
      // Same lock as registration, taken first: the capacity checks below read confirmedCount.
      await this.host.tx.$queryRaw`SELECT 1 FROM "event" WHERE "id" = ${eventId}::uuid FOR UPDATE`;

      const event = await loadEvent(this.host, eventId);
      assertEventAcceptsEdits(event);

      const { clubRoles } = await resolveClubFacts(this.host, actor.id, event.clubId);
      const facts = { platformRole: actor.platformRole, clubRoles };

      // overrideReason is not a column; EVENT_FIELDS would fail closed on it.
      const { overrideReason, ...fields } = body;
      assertFieldsAllowed(fields, EVENT_FIELDS, facts);
      const reason = overrideReasonFor(facts, overrideReason);

      const patch = body as Record<string, unknown>;
      const data: Record<string, unknown> = {};
      for (const key of PATCHABLE) {
        if (patch[key] !== undefined) data[key] = patch[key];
      }
      if (body.posterUploaded) data.bannerUrl = await this.clubs.verifyUpload('event-poster', eventId);

      const at = (key: keyof Windows): Date =>
        data[key] === undefined ? event[key] : new Date(data[key] as string);
      assertWindows({
        startsAt: at('startsAt'),
        endsAt: at('endsAt'),
        registrationOpensAt: at('registrationOpensAt'),
        registrationClosesAt: at('registrationClosesAt'),
      });

      const merged = <K extends 'certificateEnabled' | 'certificateTitle' | 'certificateSignatory'>(
        key: K,
      ) => (data[key] === undefined ? event[key] : (data[key] as (typeof event)[K]));

      assertCertificateFields({
        certificateEnabled: merged('certificateEnabled'),
        certificateTitle: merged('certificateTitle'),
        certificateSignatory: merged('certificateSignatory'),
      });

      // The lifecycle only walks forward, so a later close time would never reopen registration.
      if (
        body.registrationClosesAt !== undefined &&
        new Date(body.registrationClosesAt) > new Date() &&
        (event.status === 'REGISTRATION_CLOSED' || event.status === 'ONGOING')
      ) {
        throw new UnprocessableError('Registration cannot be reopened once it has closed.');
      }

      // For the message only; event_capacity_bounds is the guarantee.
      if (body.capacity !== undefined && body.capacity < event.confirmedCount) {
        throw new UnprocessableError(
          `Capacity cannot be lower than the ${event.confirmedCount} students already confirmed.`,
        );
      }

      const updated = await this.host.tx.event
        .update({ where: { id: eventId }, data })
        .catch(mapWriteError);

      // Raising capacity frees seats; headroom is read under the lock taken above.
      if (body.capacity !== undefined && body.capacity > event.capacity) {
        await promoteFromWaitlist(
          this.host,
          this.audit,
          this.notifications,
          eventId,
          body.capacity - event.confirmedCount,
        );
      }

      await this.audit.record({
        action: 'event.updated',
        entityType: 'Event',
        entityId: eventId,
        actorUserId: actor.id,
        reason,
        after: data,
      });

      // The subject carries the change's timestamp, so a second move is not deduped away.
      const changed = materialChanges(event, data);
      if (changed.length > 0) {
        await this.notifyRegistered(eventId, 'event.changed', `${eventId}:${updated.updatedAt.toISOString()}`, {
          eventId,
          eventTitle: updated.title,
          clubId: event.clubId,
          changed,
          startsAt: updated.startsAt.toISOString(),
          endsAt: updated.endsAt.toISOString(),
          venue: updated.venue,
          onlineUrl: updated.onlineUrl,
          timezone: updated.timezone,
        });
      }

      return this.readDetail(actor, eventId);
    });
  }

  async publish(actor: Actor, eventId: string, body: PublishEventBody): Promise<EventDetail> {
    await this.host.run(async () => {
      const event = await loadEvent(this.host, eventId);
      assertAcceptsNewActivity(event.club.status);
      assertTransition(event.status, 'PUBLISHED');

      const reason = await clubOverrideReason(this.host, actor, event.clubId, body.overrideReason);

      await this.transition(eventId, event.status, 'PUBLISHED');
      await this.audit.record({
        action: 'event.published',
        entityType: 'Event',
        entityId: eventId,
        actorUserId: actor.id,
        reason,
        before: { status: event.status },
        after: { status: 'PUBLISHED' },
      });

      // Officers are included: accepting an appointment grants membership.
      const members = await this.host.tx.clubMembership.findMany({
        where: { clubId: event.clubId, status: 'ACTIVE' },
        select: { userId: true },
      });
      await this.notifications.recordMany(
        members.map((m) => ({
          userId: m.userId,
          type: 'event.published' as const,
          subject: eventId,
          payload: {
            eventId,
            eventTitle: event.title,
            clubId: event.clubId,
            clubName: event.club.name,
            startsAt: event.startsAt.toISOString(),
          },
        })),
      );
    });

    // Advances at once if the registration window has already passed.
    return this.detail(actor, eventId);
  }

  // Registrations are left untouched, preserving who had been coming.
  async cancel(actor: Actor, eventId: string, body: CancelEventBody): Promise<EventDetail> {
    await this.host.run(async () => {
      const event = await loadEvent(this.host, eventId);
      await this.transition(eventId, event.status, 'CANCELLED', { cancelledReason: body.reason });
      await this.audit.record({
        action: 'event.cancelled',
        entityType: 'Event',
        entityId: eventId,
        reason: body.reason,
        actorUserId: actor.id,
        before: { status: event.status },
        after: { status: 'CANCELLED' },
      });

      await this.notifyRegistered(eventId, 'event.cancelled', eventId, {
        eventId,
        eventTitle: event.title,
        clubId: event.clubId,
        reason: body.reason,
        startsAt: event.startsAt.toISOString(),
      });
    });

    return this.readDetail(actor, eventId);
  }

  /** Conditional on the status read, so a concurrent writer yields a 409, never an overwrite. */
  private async transition(
    eventId: string,
    from: EventStatus,
    to: EventStatus,
    data: Omit<Prisma.EventUpdateManyMutationInput, 'status'> = {},
  ): Promise<void> {
    assertTransition(from, to);
    const { count } = await this.host.tx.event.updateMany({
      where: { id: eventId, status: from },
      data: { ...data, status: to },
    });
    if (count === 0) throw new ConflictError('That event changed while this was in progress. Try again.');
  }

  // REMOVED rows are kept on purpose: an officer took the place, the news still concerns them.
  private async notifyRegistered(
    eventId: string,
    type: 'event.changed' | 'event.cancelled',
    subject: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const holders = await this.host.tx.eventRegistration.findMany({
      where: { eventId, status: { not: 'CANCELLED' } },
      select: { userId: true },
    });
    await this.notifications.recordMany(
      holders.map((r) => ({ userId: r.userId, type, subject, payload })),
    );
  }
}

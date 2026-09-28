import { Injectable } from '@nestjs/common';
import type {
  AttendanceList,
  CheckInResult,
  CorrectAttendanceBody,
  EventStatus,
  ManualCheckInBody,
} from '@majlis/contracts';
import { AuditService } from '../audit/audit.service';
import type { Actor } from '../auth/permissions';
import { WITH_USER } from '../common/with-user';
import { CertificatesService } from '../certificates/certificates.service';
import { isUniqueViolation } from '../common/prisma-constraint';
import { NotFoundError, UnprocessableError } from '../common/problem/domain-error';
import { lockEventStatus } from '../events/event-lock';
import { EventLifecycleService, type LifecycleRow } from '../events/event-lifecycle.service';
import { EXPECTED, transitionRegistration } from '../events/registration-status';
import { TransactionHost } from '../prisma/transaction.host';

/** NO_SHOW is excluded so a check-in can never resurrect a closed event's absentee. */
const CHECKABLE = ['CONFIRMED'] as const;

/** Refused, not overwritten: WAITLISTED to CHECKED_IN would skip confirmedCount and diverge the capacity CHECK. */
const NOT_CORRECTABLE: Record<string, string> = {
  CANCELLED: 'That student cancelled their registration, so there is no attendance to correct.',
  REMOVED: 'That student was removed from the event, so there is no attendance to correct.',
  WAITLISTED: 'That student was on the waiting list and never held a place at the event.',
};

@Injectable()
export class AttendanceService {
  constructor(
    private readonly host: TransactionHost,
    private readonly audit: AuditService,
    private readonly lifecycle: EventLifecycleService,
    private readonly certificates: CertificatesService,
  ) {}

  /** Refusals are a 200 with a `result` the operator acts on. The advance runs first so a refusal cannot roll it back. */
  async manual(actor: Actor, eventId: string, body: ManualCheckInBody): Promise<CheckInResult> {
    const event = await this.lifecycle.advanceAndRead(eventId);

    try {
      return await this.host.run(() => this.checkInTx(actor, event, body));
    } catch (e) {
      // Two operators checking one person in at once: the unique index makes one lose.
      if (isUniqueViolation(e, 'attendance_record_registration_id')) {
        const already = await this.alreadyCheckedIn(eventId, body.email);
        if (already) return already;
      }
      throw e;
    }
  }

  private async checkInTx(actor: Actor, event: LifecycleRow, body: ManualCheckInBody): Promise<CheckInResult> {
    const eventId = event.id;

    // The whole time gate: the advance just made ONGOING mean "now is inside the window".
    if (event.status !== 'ONGOING') {
      return { result: 'EVENT_NOT_OPEN', eventStatus: event.status };
    }
    // Does not vary with who was presented, so it is safe before the user lookup.
    const club = await this.host.tx.club.findUnique({
      where: { id: event.clubId },
      select: { status: true },
    });
    if (club?.status !== 'ACTIVE') throw new UnprocessableError('That club is not active.');

    const user = await this.host.tx.user.findUnique({
      where: { email: body.email },
      select: { id: true, status: true, fullName: true, email: true },
    });
    // No account, suspended, or no place here must all answer the same, or this is an account oracle.
    if (!user || user.status !== 'ACTIVE') return { result: 'NOT_REGISTERED' };

    const userId = user.id;

    // At most one open row plus any number of cancelled ones, per the partial unique index.
    const rows = await this.host.tx.eventRegistration.findMany({ where: { eventId, userId } });
    const open = rows.find((r) => r.status !== 'CANCELLED');
    if (!open) return { result: rows.length > 0 ? 'REGISTRATION_CANCELLED' : 'NOT_REGISTERED' };
    if (open.status === 'REMOVED') return { result: 'REGISTRATION_CANCELLED' };

    const existing = await this.host.tx.attendanceRecord.findUnique({
      where: { registrationId: open.id },
    });
    // The original time, never a fresh one: the operator needs to know when they came through.
    if (existing) {
      return {
        result: 'ALREADY_CHECKED_IN',
        fullName: user.fullName,
        email: user.email,
        checkedInAt: existing.checkedInAt.toISOString(),
      };
    }
    if (!(CHECKABLE as readonly string[]).includes(open.status)) return { result: 'NOT_REGISTERED' };

    const record = await this.host.tx.attendanceRecord.create({
      data: {
        registrationId: open.id,
        eventId,
        userId,
        checkedInById: actor.id,
        method: 'MANUAL',
        manualReason: body.reason,
      },
    });

    await transitionRegistration(this.host, open.id, open.status, 'CHECKED_IN');

    await this.audit.record({
      action: 'attendance.manual_check_in',
      entityType: 'AttendanceRecord',
      entityId: record.id,
      actorUserId: actor.id,
      reason: body.reason,
      before: { status: open.status },
      after: { status: 'CHECKED_IN', eventId, userId, method: 'MANUAL' },
    });

    return {
      result: 'CHECKED_IN',
      fullName: user.fullName,
      email: user.email,
      checkedInAt: record.checkedInAt.toISOString(),
    };
  }

  /** Resolving the subject here discloses nothing: the P2002 already proves the row exists. */
  private async alreadyCheckedIn(eventId: string, email: string): Promise<CheckInResult | null> {
    const record = await this.host.tx.attendanceRecord.findFirst({
      where: { eventId, user: { email } },
      include: WITH_USER,
    });
    if (!record) return null;

    return {
      result: 'ALREADY_CHECKED_IN',
      fullName: record.user.fullName,
      email: record.user.email,
      checkedInAt: record.checkedInAt.toISOString(),
    };
  }

  /** Behind `registration:read`: a bulk read of attendee personal data. */
  async roster(eventId: string): Promise<AttendanceList> {
    const rows = await this.host.tx.eventRegistration.findMany({
      where: { eventId, status: { not: 'CANCELLED' } },
      orderBy: { id: 'asc' },
      include: { ...WITH_USER, attendance: true },
    });

    const [checkedIn, expected] = await Promise.all([
      this.host.tx.attendanceRecord.count({ where: { eventId } }),
      this.host.tx.eventRegistration.count({ where: { eventId, status: { in: [...EXPECTED] } } }),
    ]);

    return {
      items: rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        fullName: r.user.fullName,
        email: r.user.email,
        registrationStatus: r.status,
        checkedInAt: r.attendance?.checkedInAt.toISOString() ?? null,
        method: r.attendance?.method ?? null,
      })),
      checkedIn,
      expected,
    };
  }

  /** `present` is asserted state, not a toggle, so a retry lands on the same answer. */
  async correct(
    actor: Actor,
    eventId: string,
    registrationId: string,
    body: CorrectAttendanceBody,
  ): Promise<void> {
    await this.lifecycle.advance(eventId);

    return this.host.run(async () => {
      // Same lock issuance takes, or a NO_SHOW could end up holding an ACTIVE certificate.
      const eventStatus = await lockEventStatus(this.host, eventId);

      // Both ids: an event-scoped permission cannot authorize another event's registration.
      const registration = await this.host.tx.eventRegistration.findFirst({
        where: { id: registrationId, eventId },
      });
      if (!registration) throw new NotFoundError('No such registration for that event.');

      const override = this.assertCorrectable(actor, eventStatus, body);

      if (!(EXPECTED as readonly string[]).includes(registration.status)) {
        throw new UnprocessableError(
          NOT_CORRECTABLE[registration.status] ?? 'That registration has no attendance to correct.',
        );
      }

      const record = await this.host.tx.attendanceRecord.findUnique({ where: { registrationId } });
      const now = new Date();

      if (body.present) {
        // Upsert: an existing record must not turn this into a 409.
        await this.host.tx.attendanceRecord.upsert({
          where: { registrationId },
          create: {
            registrationId,
            eventId,
            userId: registration.userId,
            checkedInById: actor.id,
            method: 'MANUAL',
            manualReason: body.reason,
            correctedAt: now,
            correctedById: actor.id,
            correctionReason: body.reason,
          },
          update: { correctedAt: now, correctedById: actor.id, correctionReason: body.reason },
        });
      } else if (record) {
        // Counts, roster and eligibility all read the record; the audit before-snapshot preserves it.
        await this.host.tx.attendanceRecord.delete({ where: { registrationId } });
      }

      const status = body.present ? 'CHECKED_IN' : eventStatus === 'ONGOING' ? 'CONFIRMED' : 'NO_SHOW';
      await transitionRegistration(this.host, registrationId, registration.status, status);

      // Absent after CERTIFIED must revoke in this transaction, or the certificate stays ACTIVE.
      const certificateRevoked = body.present
        ? false
        : await this.certificates.revokeForRegistration(actor, registrationId, body.reason);

      await this.audit.record({
        action: 'attendance.corrected',
        entityType: 'EventRegistration',
        entityId: registrationId,
        reason: body.reason,
        actorUserId: actor.id,
        before: {
          status: registration.status,
          checkedInAt: record?.checkedInAt.toISOString() ?? null,
          ...(override ? { override } : {}),
        },
        after: { status, present: body.present, ...(certificateRevoked ? { certificateRevoked } : {}) },
      });
    });
  }

  /** Open from start until certificates issue, then Admin override only. Returns the override reason. */
  private assertCorrectable(
    actor: Actor,
    status: EventStatus,
    body: CorrectAttendanceBody,
  ): string | undefined {
    if (status === 'CANCELLED') throw new UnprocessableError('That event was cancelled.');
    if (status !== 'ONGOING' && status !== 'COMPLETED' && status !== 'CERTIFIED') {
      throw new UnprocessableError('That event has not started, so there is no attendance to correct.');
    }
    if (status !== 'CERTIFIED') return undefined;

    if (actor.platformRole !== 'ADMIN') {
      throw new UnprocessableError('That event has issued certificates and its attendance is locked.');
    }
    if (!body.override?.reason) {
      throw new UnprocessableError(
        'Correcting attendance after certificates have issued requires an override reason.',
      );
    }
    return body.override.reason;
  }
}

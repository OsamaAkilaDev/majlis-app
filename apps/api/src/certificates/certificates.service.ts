import { Injectable } from '@nestjs/common';
import type {
  Certificate,
  CertificateIssueResult,
  CertificateList,
  RevokeCertificateBody,
} from '@majlis/contracts';
import { AuditService } from '../audit/audit.service';
import type { Actor } from '../auth/permissions';
import { ConflictError, NotFoundError, UnprocessableError } from '../common/problem/domain-error';
import { EventLifecycleService } from '../events/event-lifecycle.service';
import { lockEventStatus } from '../events/event-lock';
import { assertTransition } from '../events/event-status';
import { Prisma, type Certificate as CertificateRow } from '../generated/prisma/client';
import { NotificationService } from '../notifications/notification.service';
import { TransactionHost } from '../prisma/transaction.host';
import { serialNumber, verificationCode } from './certificate-codes';
import { assertCertificateTransition } from './certificate-status';

const ELIGIBLE = ['CHECKED_IN', 'ATTENDED'] as const;

/** A code collision is unlikely but must be retried, not answered with a 500. */
const INSERT_ATTEMPTS = 3;

const EVENT_FOR_ISSUE = {
  id: true,
  title: true,
  status: true,
  endsAt: true,
  certificateEnabled: true,
  attendancePolicy: true,
  club: { select: { name: true, logoUrl: true } },
} as const;

type IssuableEvent = Prisma.EventGetPayload<{ select: typeof EVENT_FOR_ISSUE }>;

function toCertificate(row: CertificateRow): Certificate {
  return {
    id: row.id,
    eventId: row.eventId,
    userId: row.userId,
    serialNumber: row.serialNumber,
    verificationCode: row.verificationCode,
    status: row.status,
    holderName: row.holderNameSnapshot,
    eventTitle: row.eventTitleSnapshot,
    clubName: row.clubNameSnapshot,
    clubLogoUrl: row.clubLogoSnapshotUrl,
    issuedAt: row.issuedAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
    revokedReason: row.revokedReason,
  };
}

@Injectable()
export class CertificatesService {
  constructor(
    private readonly host: TransactionHost,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
    private readonly lifecycle: EventLifecycleService,
  ) {}

  /** Only issued on a button press, never on a timer, because attendance stays correctable until then. */
  async issue(actor: Actor, eventId: string): Promise<CertificateIssueResult> {
    // Advanced before the transaction, as advance() requires.
    await this.lifecycle.advance(eventId);
    return this.host.run(async () => {
      // Same lock an attendance correction takes, so eligibility is read after it commits.
      await lockEventStatus(this.host, eventId);
      const event = await this.host.tx.event.findUniqueOrThrow({
        where: { id: eventId },
        select: EVENT_FOR_ISSUE,
      });

      const refusal = this.notIssuableReason(event);
      if (refusal) throw new UnprocessableError(refusal);
      return this.issueCore(actor, event);
    });
  }

  /** CERTIFIED is not a refusal: issuance is idempotent, so a second press is a no-op. */
  private notIssuableReason(event: IssuableEvent): string | null {
    if (!event.certificateEnabled) return 'That event does not issue certificates.';
    if (event.status === 'CERTIFIED') return null;
    if (event.status !== 'COMPLETED') return 'That event has not finished yet.';
    return null;
  }

  private async issueCore(actor: Actor, event: IssuableEvent): Promise<CertificateIssueResult> {
    return this.host.run(async () => {
      let issued = 0;

      for (let attempt = 0; attempt < INSERT_ATTEMPTS; attempt += 1) {
        const pending = await this.host.tx.eventRegistration.findMany({
          where: {
            eventId: event.id,
            status: { in: [...ELIGIBLE] },
            // The partial unique index is the guarantee; this just skips the common case.
            certificates: { none: { status: 'ACTIVE' } },
          },
          include: { user: { select: { fullName: true } } },
        });
        if (pending.length === 0) break;

        // ON CONFLICT DO NOTHING: a caught P2002 would leave the transaction aborted.
        const { count } = await this.host.tx.certificate.createMany({
          data: pending.map((r) => this.newRow(event, r.id, r.userId, r.user.fullName)),
          skipDuplicates: true,
        });
        issued += count;
        // Short means a concurrent run or a code collision; the next pass re-reads.
        if (count === pending.length) break;
      }

      // Read back: createMany returns no ids, and the notification dedupe key absorbs re-presses.
      const active = await this.host.tx.certificate.findMany({
        where: { eventId: event.id, status: 'ACTIVE' },
        select: { id: true, userId: true, serialNumber: true },
      });
      const total = active.length;

      await this.notifications.recordMany(
        active.map((c) => ({
          userId: c.userId,
          type: 'certificate.issued' as const,
          subject: c.id,
          payload: {
            certificateId: c.id,
            eventId: event.id,
            eventTitle: event.title,
            serialNumber: c.serialNumber,
          },
        })),
      );

      let certified = false;
      if (event.status === 'COMPLETED') {
        assertTransition(event.status, 'CERTIFIED');
        const { count } = await this.host.tx.event.updateMany({
          where: { id: event.id, status: 'COMPLETED' },
          data: { status: 'CERTIFIED' },
        });
        certified = count > 0;
      }

      // Any press that issued, not only the certifying one: a re-press after a correction issues too.
      if (certified || issued > 0) {
        await this.audit.record({
          action: 'certificate.issued_for_event',
          entityType: 'Event',
          entityId: event.id,
          actorUserId: actor.id,
          ...(certified ? { before: { status: 'COMPLETED' } } : {}),
          after: { status: 'CERTIFIED', issued, total },
        });
      }

      return { issued, total };
    });
  }

  /** Snapshot columns are filled here and never updated, so a later rename cannot alter an issued certificate. */
  private newRow(
    event: IssuableEvent,
    registrationId: string,
    userId: string,
    fullName: string,
  ): Prisma.CertificateCreateManyInput {
    return {
      registrationId,
      eventId: event.id,
      userId,
      serialNumber: serialNumber(),
      verificationCode: verificationCode(),
      holderNameSnapshot: fullName,
      eventTitleSnapshot: event.title,
      clubNameSnapshot: event.club.name,
      clubLogoSnapshotUrl: event.club.logoUrl,
    };
  }

  async forEvent(eventId: string): Promise<CertificateList> {
    const rows = await this.host.tx.certificate.findMany({ where: { eventId }, orderBy: { id: 'asc' } });
    return { items: rows.map(toCertificate) };
  }

  async mine(actor: Actor): Promise<CertificateList> {
    const rows = await this.host.tx.certificate.findMany({ where: { userId: actor.id }, orderBy: { id: 'desc' } });
    return { items: rows.map(toCertificate) };
  }

  async revoke(actor: Actor, certificateId: string, body: RevokeCertificateBody): Promise<Certificate> {
    return this.host.run(async () => {
      const row = await this.loadActive(certificateId);
      return toCertificate(await this.revokeRow(actor, row, body.reason));
    });
  }

  /** Called inside AttendanceService's transaction so revocation and correction commit together. */
  async revokeForRegistration(actor: Actor, registrationId: string, reason: string): Promise<boolean> {
    return this.host.run(async () => {
      const row = await this.host.tx.certificate.findFirst({
        where: { registrationId, status: 'ACTIVE' },
      });
      if (!row) return false;

      await this.revokeRow(actor, row, reason);
      return true;
    });
  }

  private async loadActive(certificateId: string): Promise<CertificateRow> {
    const row = await this.host.tx.certificate.findUnique({ where: { id: certificateId } });
    if (!row) throw new NotFoundError('No such certificate.');
    if (row.status !== 'ACTIVE') throw new UnprocessableError('That certificate is already revoked.');
    return row;
  }

  /**
   * Every revocation path, so the audit row and notification are written once, in the caller's transaction.
   * Conditional on ACTIVE: a concurrent revocation gets a 409, not a second audit row.
   */
  private async revokeRow(actor: Actor, row: CertificateRow, reason: string): Promise<CertificateRow> {
    assertCertificateTransition(row.status, 'REVOKED');
    const { count } = await this.host.tx.certificate.updateMany({
      where: { id: row.id, status: 'ACTIVE' },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
        revokedById: actor.id,
        revokedReason: reason,
      },
    });
    if (count === 0) throw new ConflictError('That certificate was revoked while this was in progress.');
    const revoked = await this.host.tx.certificate.findUniqueOrThrow({ where: { id: row.id } });

    await this.audit.record({
      action: 'certificate.revoked',
      entityType: 'Certificate',
      entityId: row.id,
      reason,
      actorUserId: actor.id,
      before: { status: 'ACTIVE' },
      after: { status: 'REVOKED', registrationId: row.registrationId },
    });

    await this.notifications.record({
      userId: row.userId,
      type: 'certificate.revoked',
      subject: row.id,
      payload: {
        certificateId: row.id,
        eventId: row.eventId,
        eventTitle: row.eventTitleSnapshot,
        serialNumber: row.serialNumber,
        reason,
      },
    });

    return revoked;
  }
}

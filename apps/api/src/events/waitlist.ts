import type { AuditService } from '../audit/audit.service';
import type { NotificationService } from '../notifications/notification.service';
import type { TransactionHost } from '../prisma/transaction.host';
import { assertRegistrationTransition } from './registration-status';

/** SKIP LOCKED so two promoters never pick the same student. Callers hold the event row lock. */
export async function promoteFromWaitlist(
  host: TransactionHost,
  audit: AuditService,
  notifications: NotificationService,
  eventId: string,
  seats: number,
): Promise<number> {
  if (seats <= 0) return 0;

  const queued = await host.tx.$queryRaw<{ id: string; user_id: string }[]>`
    SELECT "id", "user_id" FROM "event_registration"
    WHERE "event_id" = ${eventId}::uuid AND "status" = 'WAITLISTED'
    ORDER BY "waitlist_position" ASC
    LIMIT ${seats}
    FOR UPDATE SKIP LOCKED`;

  if (queued.length === 0) return 0;

  assertRegistrationTransition('WAITLISTED', 'CONFIRMED');
  const promotedAt = new Date();
  // A non-null position reads as "waitlisted" everywhere.
  await host.tx.eventRegistration.updateMany({
    where: { id: { in: queued.map((r) => r.id) }, status: 'WAITLISTED' },
    data: { status: 'CONFIRMED', promotedAt, waitlistPosition: null },
  });

  for (const row of queued) {
    await audit.record({
      action: 'event.registration_promoted',
      entityType: 'EventRegistration',
      entityId: row.id,
      before: { status: 'WAITLISTED' },
      after: { status: 'CONFIRMED', userId: row.user_id, eventId },
    });
  }

  // Same transaction, so a rolled-back promotion cannot tell somebody they have a seat.
  const { title } = await host.tx.event.findUniqueOrThrow({
    where: { id: eventId },
    select: { title: true },
  });
  await notifications.recordMany(
    queued.map((row) => ({
      userId: row.user_id,
      type: 'registration.promoted' as const,
      subject: row.id,
      payload: { registrationId: row.id, eventId, eventTitle: title, status: 'CONFIRMED' },
    })),
  );

  await host.tx.event.update({
    where: { id: eventId },
    data: { confirmedCount: { increment: queued.length } },
  });

  return queued.length;
}

import type { EventStatus } from '@majlis/contracts';
import { NotFoundError } from '../common/problem/domain-error';
import type { TransactionHost } from '../prisma/transaction.host';

/** Issuance and attendance correction both take this, so neither decides on what the other is changing. */
export async function lockEventStatus(host: TransactionHost, eventId: string): Promise<EventStatus> {
  const rows = await host.tx.$queryRaw<{ status: EventStatus }[]>`
    SELECT "status"::text AS "status" FROM "event" WHERE "id" = ${eventId}::uuid FOR UPDATE`;
  if (!rows[0]) throw new NotFoundError('No such event.');
  return rows[0].status;
}

import { NotFoundError } from '../common/problem/domain-error';
import type { Event as EventRow } from '../generated/prisma/client';
import type { TransactionHost } from '../prisma/transaction.host';

export const WITH_CLUB = { club: { select: { name: true, slug: true, logoUrl: true, status: true } } } as const;

export type EventWithClub = EventRow & {
  club: { name: string; slug: string; logoUrl: string; status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED' };
};

export async function loadEvent(host: TransactionHost, eventId: string): Promise<EventWithClub> {
  const row = await host.tx.event.findUnique({ where: { id: eventId }, include: WITH_CLUB });
  if (!row) throw new NotFoundError('No such event.');
  return row;
}

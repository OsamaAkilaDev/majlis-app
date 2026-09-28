import type { ClubStatus } from '@majlis/contracts';
import { NotFoundError } from '../common/problem/domain-error';
import type { Club } from '../generated/prisma/client';
import type { TransactionHost } from '../prisma/transaction.host';

/** Not-found always precedes the status check, so a missing club is never reported as archived. */
export async function loadClub(
  host: TransactionHost,
  clubId: string,
  assertStatus?: (status: ClubStatus) => void,
): Promise<Club> {
  const club = await host.tx.club.findUnique({ where: { id: clubId } });
  if (!club) throw new NotFoundError('No such club.');
  assertStatus?.(club.status);
  return club;
}

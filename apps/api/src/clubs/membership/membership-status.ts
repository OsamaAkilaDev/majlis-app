import { ConflictError, UnprocessableError } from '../../common/problem/domain-error';
import type { Prisma } from '../../generated/prisma/client';
import type { MembershipStatus } from '../../generated/prisma/enums';
import type { TransactionHost } from '../../prisma/transaction.host';

const ALLOWED: Record<MembershipStatus, MembershipStatus[]> = {
  PENDING: ['ACTIVE', 'REJECTED', 'LEFT', 'REMOVED'],
  ACTIVE: ['LEFT', 'REMOVED'],
  REJECTED: [],
  LEFT: [],
  REMOVED: [],
};

/** Conditional on the status read, so of two concurrent deciders the second gets a 409. */
export async function transitionMembership(
  host: TransactionHost,
  id: string,
  from: MembershipStatus,
  to: MembershipStatus,
  data: Omit<Prisma.ClubMembershipUncheckedUpdateManyInput, 'status'> = {},
): Promise<void> {
  if (!ALLOWED[from].includes(to)) throw new UnprocessableError(`A membership cannot go from ${from} to ${to}.`);
  const { count } = await host.tx.clubMembership.updateMany({ where: { id, status: from }, data: { ...data, status: to } });
  if (count === 0) throw new ConflictError('That membership was changed by someone else. Reload and try again.');
}

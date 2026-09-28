import type { RegistrationStatus } from '@majlis/contracts';
import { ConflictError, UnprocessableError } from '../common/problem/domain-error';
import type { Prisma } from '../generated/prisma/client';
import type { TransactionHost } from '../prisma/transaction.host';

/** Held a confirmed place: attendance's denominator. Waitlisted students were never expected. */
export const EXPECTED = ['CONFIRMED', 'CHECKED_IN', 'ATTENDED', 'NO_SHOW'] as const;

// A correction states a fact, so re-asserting the current status is allowed.
const CORRECTED: readonly RegistrationStatus[] = ['CONFIRMED', 'CHECKED_IN', 'NO_SHOW'];

// WAITLISTED reaches CHECKED_IN only through CONFIRMED, which moves the counter.
const ALLOWED: Record<RegistrationStatus, readonly RegistrationStatus[]> = {
  CONFIRMED: ['CANCELLED', ...CORRECTED],
  WAITLISTED: ['CONFIRMED', 'CANCELLED'],
  CHECKED_IN: CORRECTED,
  ATTENDED: CORRECTED,
  NO_SHOW: CORRECTED,
  CANCELLED: [],
  REMOVED: [],
};

export function assertRegistrationTransition(from: RegistrationStatus, to: RegistrationStatus): void {
  if (!ALLOWED[from].includes(to)) {
    throw new UnprocessableError(`A registration cannot go from ${from} to ${to}.`);
  }
}

/** Conditional on the status read, so a concurrent writer yields a 409, never an overwrite. */
export async function transitionRegistration(
  host: TransactionHost,
  id: string,
  from: RegistrationStatus,
  to: RegistrationStatus,
  data: Omit<Prisma.EventRegistrationUpdateManyMutationInput, 'status'> = {},
): Promise<void> {
  assertRegistrationTransition(from, to);
  const { count } = await host.tx.eventRegistration.updateMany({
    where: { id, status: from },
    data: { ...data, status: to },
  });
  if (count === 0) throw new ConflictError('That registration changed while this was in progress. Try again.');
}

import type { ClubStatus } from '@majlis/contracts';
import { UnprocessableError } from '../common/problem/domain-error';

const ALLOWED: Record<ClubStatus, ClubStatus[]> = {
  ACTIVE: ['SUSPENDED', 'ARCHIVED'],
  SUSPENDED: ['ACTIVE', 'ARCHIVED'],
  ARCHIVED: ['ACTIVE', 'SUSPENDED'],
};

export function assertTransition(from: ClubStatus, to: ClubStatus): void {
  if (from === to) throw new UnprocessableError('That club is already in that state.');
  if (!ALLOWED[from].includes(to)) {
    throw new UnprocessableError(`A club cannot go from ${from} to ${to}.`);
  }
}

export function assertAcceptsNewActivity(status: ClubStatus): void {
  if (status !== 'ACTIVE') throw new UnprocessableError('That club is not accepting new activity.');
}

// Declining an invitation is exempt: it grants nothing, and blocking it strands the invitation.
export function assertAcceptsEdits(status: ClubStatus): void {
  if (status === 'ARCHIVED') throw new UnprocessableError('That club is archived.');
}

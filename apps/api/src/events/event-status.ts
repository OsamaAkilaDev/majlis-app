import type { ClubStatus, EventStatus } from '@majlis/contracts';
import { assertAcceptsEdits as assertClubAcceptsEdits } from '../clubs/club-status';
import { UnprocessableError } from '../common/problem/domain-error';
import type { Prisma } from '../generated/prisma/client';

// CANCELLED is absent: reachable from any state but not a step, and `advance` walks this by index.
export const CHAIN = [
  'DRAFT',
  'PUBLISHED',
  'REGISTRATION_CLOSED',
  'ONGOING',
  'COMPLETED',
  'CERTIFIED',
] as const satisfies readonly EventStatus[];

/** One step forward along CHAIN, or to CANCELLED. CERTIFIED and CANCELLED are terminal. */
export function assertTransition(from: EventStatus, to: EventStatus): void {
  if (from === to) throw new UnprocessableError('That event is already in that state.');
  if (from === 'CANCELLED') throw new UnprocessableError('That event was cancelled.');
  if (from === 'CERTIFIED') throw new UnprocessableError('That event has issued certificates and is final.');
  if (to === 'CANCELLED') return;

  const at = CHAIN.indexOf(from as (typeof CHAIN)[number]);
  const next = CHAIN.indexOf(to as (typeof CHAIN)[number]);
  if (next !== at + 1) throw new UnprocessableError(`An event cannot go from ${from} to ${to}.`);
}

export interface DueStatusInput {
  status: EventStatus;
  registrationClosesAt: Date;
  startsAt: Date;
  endsAt: Date;
}

/**
 * Pure, so a list read can render it without writing. Ordered by lifecycle, not timestamp:
 * registration may close mid-event, and checking it first would shut check-in.
 */
export function dueStatus(event: DueStatusInput, now: Date): EventStatus {
  if (event.status === 'DRAFT' || event.status === 'CANCELLED' || event.status === 'CERTIFIED') {
    return event.status;
  }
  if (now > event.endsAt) return 'COMPLETED';
  if (now >= event.startsAt) return 'ONGOING';
  if (now >= event.registrationClosesAt) return 'REGISTRATION_CLOSED';
  return 'PUBLISHED';
}

/** Shared by `update` and the poster upload mint: guarding only one leaves a way round it. */
export function assertEventAcceptsEdits(event: {
  status: EventStatus;
  club: { status: ClubStatus };
}): void {
  assertClubAcceptsEdits(event.club.status);
  if (event.status === 'CANCELLED' || event.status === 'COMPLETED' || event.status === 'CERTIFIED') {
    throw new UnprocessableError(`A ${event.status.toLowerCase()} event can no longer be edited.`);
  }
}

/** Shared by the club page and the club report. Checks the clock too: an unread event keeps its stored status. */
export function eventsHeld(now = new Date()): Prisma.EventWhereInput {
  return {
    OR: [
      { status: { in: ['COMPLETED', 'CERTIFIED'] } },
      { status: { in: ['PUBLISHED', 'REGISTRATION_CLOSED', 'ONGOING'] }, endsAt: { lt: now } },
    ],
  };
}

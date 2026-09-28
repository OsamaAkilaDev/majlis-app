/**
 * Which keys of a patch body a club role may change; the route permission only decides the resource.
 * A key absent from a map is refused, so a new patch field fails closed.
 */

import { ForbiddenError, UnprocessableError } from '../common/problem/domain-error';
import type { ActorFacts, ClubRole } from './permissions';

const FULL_FIELD_ACCESS: ClubRole[] = ['LEAD', 'VICE_LEAD'];

/** CTO holds nothing on a club, which is why `club:edit` does not grant CTO. */
export const CLUB_FIELDS = {
  description: ['MARKETING'],
  category: ['MARKETING'],
  logoUploaded: ['MARKETING'],
  bannerUploaded: ['MARKETING'],
  departmentId: [],
  academicYear: [],
  membershipPolicy: [],
} as const satisfies Record<string, readonly ClubRole[]>;

/** The empty last bucket is on purpose: timing and slug stay with Lead, Vice and Admin. */
export const EVENT_FIELDS = {
  title: ['MARKETING'],
  summary: ['MARKETING'],
  description: ['MARKETING'],
  eventType: ['MARKETING'],
  audience: ['MARKETING'],
  posterUploaded: ['MARKETING'],

  onlineUrl: ['CTO'],
  timezone: ['CTO'],
  attendancePolicy: ['CTO'],
  certificateEnabled: ['CTO'],
  certificateTitle: ['CTO'],
  certificateSignatory: ['CTO'],

  venue: ['OPERATIONS'],
  capacity: ['OPERATIONS'],
  waitlistEnabled: ['OPERATIONS'],

  slug: [],
  startsAt: [],
  endsAt: [],
  registrationOpensAt: [],
  registrationClosesAt: [],
  requiresClubMembership: [],
} as const satisfies Record<string, readonly ClubRole[]>;

export type FieldMap = Record<string, readonly ClubRole[]>;

/** An Admin who also holds a club role is acting in that capacity, not overriding. */
export function overrideReasonFor(
  facts: Pick<ActorFacts, 'platformRole' | 'clubRoles'>,
  reason: string | undefined,
): string | undefined {
  if (facts.platformRole !== 'ADMIN' || facts.clubRoles.length > 0) return undefined;
  if (!reason) throw new UnprocessableError('An admin override requires a reason.');
  return reason;
}

/** `facts` must be re-derived from the database; ADMIN passes and the caller audits the override. */
export function assertFieldsAllowed(
  body: object,
  map: FieldMap,
  facts: Pick<ActorFacts, 'platformRole' | 'clubRoles'>,
): void {
  if (facts.platformRole === 'ADMIN') return;
  if (facts.clubRoles.some((r) => FULL_FIELD_ACCESS.includes(r))) return;

  for (const key of Object.keys(body)) {
    const allowed = map[key];
    if (!allowed?.some((r) => facts.clubRoles.includes(r))) {
      throw new ForbiddenError(`You do not have permission to change ${key}.`);
    }
  }
}

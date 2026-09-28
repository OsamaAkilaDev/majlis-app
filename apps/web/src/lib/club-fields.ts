import type { ClubRole, SessionUser } from '@majlis/contracts';

/** Mirrors the API's CLUB_FIELDS, checked by club-fields.test.ts. Presentation only; the server enforces. */

/** Lead and Vice hold every field, so neither is ever listed in a bucket. */
const FULL_FIELD_ACCESS: ClubRole[] = ['LEAD', 'VICE_LEAD'];

export const CLUB_FIELD_ROLES = {
  description: ['MARKETING'],
  category: ['MARKETING'],
  logoUploaded: ['MARKETING'],
  bannerUploaded: ['MARKETING'],
  departmentId: [],
  academicYear: [],
  membershipPolicy: [],
} as const satisfies Record<string, readonly ClubRole[]>;

export type ClubField = keyof typeof CLUB_FIELD_ROLES;

export function canEditClubField(
  field: ClubField,
  clubRoles: readonly ClubRole[],
  platformRole: SessionUser['platformRole'],
): boolean {
  if (platformRole === 'ADMIN') return true;
  if (clubRoles.some((r) => FULL_FIELD_ACCESS.includes(r))) return true;
  return CLUB_FIELD_ROLES[field].some((r) => clubRoles.includes(r));
}

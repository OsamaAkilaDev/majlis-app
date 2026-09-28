import type { ClubRole, SessionUser } from '@majlis/contracts';

/** Presentation-only mirror of the API's PERMISSIONS; club-sections.test.ts keeps it in sync. */
export type ClubSectionKey = 'edit' | 'members' | 'team' | 'reports';

/** No Certificates section: `certificate:manage` grants no club role, so the API would refuse it. */
export const CLUB_SECTION_ROLES = {
  edit: ['VICE_LEAD', 'MARKETING'],
  members: ['LEAD', 'VICE_LEAD', 'OPERATIONS'],
  team: ['LEAD'],
  reports: ['LEAD', 'VICE_LEAD'],
} as const satisfies Record<ClubSectionKey, readonly ClubRole[]>;

export interface ClubSection {
  key: ClubSectionKey;
  label: string;
  /** Appended to `/clubs/{slug}/`. */
  path: string;
}

const SECTIONS: ClubSection[] = [
  { key: 'edit', label: 'Edit club', path: 'edit' },
  { key: 'members', label: 'Members', path: 'members' },
  { key: 'team', label: 'Team', path: 'team' },
  { key: 'reports', label: 'Reports', path: 'reports' },
];

export function clubSectionsFor(
  clubRoles: readonly ClubRole[],
  platformRole: SessionUser['platformRole'],
): ClubSection[] {
  if (platformRole === 'ADMIN') return SECTIONS;
  return SECTIONS.filter((s) => CLUB_SECTION_ROLES[s.key].some((r) => clubRoles.includes(r)));
}

/** Creating needs every field, and only Lead and Vice Lead hold startsAt. */
export function canCreateEvent(
  clubRoles: readonly ClubRole[],
  platformRole: SessionUser['platformRole'],
): boolean {
  return (
    platformRole === 'ADMIN' || clubRoles.includes('LEAD') || clubRoles.includes('VICE_LEAD')
  );
}

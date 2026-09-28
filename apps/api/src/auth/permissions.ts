// No `platformRole === 'ADMIN'` shortcut on purpose: some permissions are withheld from Admin.

export type PlatformRole = 'STUDENT' | 'ADMIN';
export type ClubRole = 'LEAD' | 'VICE_LEAD' | 'MARKETING' | 'CTO' | 'OPERATIONS';
export type EventResponsibility = 'EVENT_LEAD' | 'OPERATIONS' | 'MARKETING';

// Asserted equal to the Prisma enums so a schema rename fails to compile. Tuples stop distribution.
import type {
  ClubRole as PrismaClubRole,
  EventResponsibility as PrismaEventResponsibility,
  PlatformRole as PrismaPlatformRole,
} from '../generated/prisma/enums';

type _SyncPlatformRole = [PlatformRole] extends [PrismaPlatformRole]
  ? [PrismaPlatformRole] extends [PlatformRole]
    ? true
    : never
  : never;
const _syncPlatformRole: _SyncPlatformRole = true;

type _SyncClubRole = [ClubRole] extends [PrismaClubRole]
  ? [PrismaClubRole] extends [ClubRole]
    ? true
    : never
  : never;
const _syncClubRole: _SyncClubRole = true;

type _SyncEventResponsibility = [EventResponsibility] extends [PrismaEventResponsibility]
  ? [PrismaEventResponsibility] extends [EventResponsibility]
    ? true
    : never
  : never;
const _syncEventResponsibility: _SyncEventResponsibility = true;

export interface Actor {
  id: string;
  platformRole: PlatformRole;
}

/** Roles in the request's scoped club or event only, never every club the actor holds a role in. */
export interface ActorFacts {
  userId: string;
  platformRole: PlatformRole;
  clubRoles: ClubRole[];
  eventResponsibilities: EventResponsibility[];
}

export interface PermissionRule {
  platform?: PlatformRole[];
  club?: ClubRole[];
  event?: EventResponsibility[];
}

export const PERMISSIONS = {
  'user:list': { platform: ['ADMIN'] },
  // Only on routes carrying a clubId: a club rule cannot authorize an unscoped route.
  'user:search': { platform: ['ADMIN'], club: ['LEAD', 'VICE_LEAD'] },
  'user:suspend': { platform: ['ADMIN'] },
  // Never club-scoped: it writes `platformRole`, so an officer could mint an admin.
  'user:edit': { platform: ['ADMIN'] },
  'department:manage': { platform: ['ADMIN'] },
  'club:create': { platform: ['ADMIN'] },
  'club:status': { platform: ['ADMIN'] },
  'club:appoint-lead': { platform: ['ADMIN'] },
  'club:edit': { platform: ['ADMIN'], club: ['VICE_LEAD', 'MARKETING'] },
  'club:team-manage': { platform: ['ADMIN'], club: ['LEAD'] },
  'membership:decide': { platform: ['ADMIN'], club: ['LEAD', 'VICE_LEAD', 'OPERATIONS'] },

  // Creation sets every field, including ones only Lead and Vice may edit.
  'event:create': { platform: ['ADMIN'], club: ['LEAD', 'VICE_LEAD'] },
  // Every club role reaches the route; EVENT_FIELDS decides which keys.
  'event:edit': { platform: ['ADMIN'], club: ['LEAD', 'VICE_LEAD', 'MARKETING', 'CTO', 'OPERATIONS'] },
  'event:publish': { platform: ['ADMIN'], club: ['LEAD', 'VICE_LEAD'] },
  'event:cancel': { platform: ['ADMIN'], club: ['LEAD'] },
  'event:assign': { platform: ['ADMIN'], club: ['LEAD', 'VICE_LEAD'] },
  // Operations only via an EventAssignment, hence the event column.
  'registration:read': {
    platform: ['ADMIN'],
    club: ['LEAD', 'VICE_LEAD'],
    event: ['EVENT_LEAD', 'OPERATIONS'],
  },
  // Vice Lead is absent deliberately from both of these.
  'attendance:check-in': {
    platform: ['ADMIN'],
    club: ['LEAD'],
    event: ['EVENT_LEAD'],
  },
  // No event column: an assignment may check people in, not rewrite.
  'attendance:correct': { platform: ['ADMIN'], club: ['LEAD', 'OPERATIONS'] },
  // Always scoped to an event or certificate, so a role elsewhere reaches nothing.
  'certificate:manage': { platform: ['ADMIN'], club: ['LEAD', 'VICE_LEAD', 'MARKETING', 'CTO', 'OPERATIONS'] },
  // /reports/overview is unscoped, so only Admin reaches it.
  'report:read': { platform: ['ADMIN'], club: ['LEAD', 'VICE_LEAD'] },
  // Vice Lead is absent deliberately.
  'audit:read': { platform: ['ADMIN'], club: ['LEAD'] },
} as const satisfies Record<string, PermissionRule>;

export type Permission = keyof typeof PERMISSIONS;

// Widened so a key cast through at runtime looks up to `undefined`.
const RULES: Record<string, PermissionRule> = PERMISSIONS;

export function evaluate(permission: Permission, facts: ActorFacts): boolean {
  const rule = RULES[permission];
  // A typo in a @RequirePermission argument must fail closed.
  if (!rule) return false;
  return matches(rule, facts);
}

export function matches(rule: PermissionRule, facts: ActorFacts): boolean {
  if (rule.platform?.includes(facts.platformRole)) return true;
  if (rule.club?.some((r) => facts.clubRoles.includes(r))) return true;
  if (rule.event?.some((r) => facts.eventResponsibilities.includes(r))) return true;
  return false;
}

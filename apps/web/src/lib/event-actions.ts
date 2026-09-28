import type { ClubRole, EventDetail, EventResponsibility, SessionUser } from '@majlis/contracts';

/** Mirror of PERMISSIONS in `apps/api/src/auth/permissions.ts`, checked by event-actions.test.ts.
 *  Presentation only: the guard re-derives every permission per request. */
export type EventActionKey = 'publish' | 'edit' | 'attendees' | 'checkIn' | 'certificates' | 'cancel';

interface Rule {
  club: readonly ClubRole[];
  event: readonly EventResponsibility[];
}

/** The permission each control is gated on server-side. The `event` column lets a per-event
 *  assignment reach the roster and check-in without a standing officer role. */
export const EVENT_ACTION_ROLES = {
  publish: { club: ['LEAD', 'VICE_LEAD'], event: [] },
  edit: { club: ['LEAD', 'VICE_LEAD', 'MARKETING', 'CTO', 'OPERATIONS'], event: [] },
  attendees: { club: ['LEAD', 'VICE_LEAD'], event: ['EVENT_LEAD', 'OPERATIONS'] },
  checkIn: { club: ['LEAD'], event: ['EVENT_LEAD'] },
  certificates: { club: ['LEAD', 'VICE_LEAD', 'MARKETING', 'CTO', 'OPERATIONS'], event: [] },
  cancel: { club: ['LEAD'], event: [] },
} as const satisfies Record<EventActionKey, Rule>;

export interface EventAction {
  key: EventActionKey;
  label: string;
  /** Appended to `/events/{eventId}/`, or null for one performed in place. */
  path: string | null;
}

const ACTIONS: EventAction[] = [
  { key: 'publish', label: 'Publish', path: null },
  { key: 'edit', label: 'Edit', path: 'edit' },
  { key: 'attendees', label: 'Attendees', path: 'attendees' },
  { key: 'checkIn', label: 'Check in', path: 'check-in' },
  { key: 'certificates', label: 'Certificates', path: 'certificates' },
  { key: 'cancel', label: 'Cancel event', path: null },
];

/** Mirrors `dueStatus` in `apps/api/src/events/event-status.ts`: ONGOING exactly while the event runs. */
/** An EventSummary has no `certificateEnabled`; absent, it does not rule the event out. */
type EventState = Pick<EventDetail, 'status' | 'startsAt' | 'endsAt'> &
  Partial<Pick<EventDetail, 'certificateEnabled'>>;

function isLive(event: EventState, now: Date): boolean {
  if (event.status === 'DRAFT' || event.status === 'CANCELLED' || event.status === 'CERTIFIED') {
    return false;
  }
  const at = now.getTime();
  return at >= Date.parse(event.startsAt) && at <= Date.parse(event.endsAt);
}

/** The API accepts a registration change only while the event is in one of these. */
export const REGISTRATION_CHANGEABLE: readonly string[] = ['PUBLISHED', 'REGISTRATION_CLOSED', 'CANCELLED'];

/** The three terminal states of `assertEventAcceptsEdits`. */
const UNEDITABLE = ['CANCELLED', 'COMPLETED', 'CERTIFIED'];

/** `assertTransition` refuses every move out of these two. */
const TERMINAL = ['CANCELLED', 'CERTIFIED'];

/** Whether the event's state admits the action at all, roles aside. */
export function eventActionApplies(key: EventActionKey, event: EventState, now: Date): boolean {
  switch (key) {
    case 'publish':
      return event.status === 'DRAFT';
    case 'edit':
      return !UNEDITABLE.includes(event.status);
    case 'cancel':
      return !TERMINAL.includes(event.status);
    case 'checkIn':
      return isLive(event, now);
    case 'attendees':
      return true;
    // Only once issuing could succeed: the API refuses an unfinished event.
    case 'certificates':
      return (
        event.certificateEnabled !== false &&
        (event.status === 'COMPLETED' || event.status === 'CERTIFIED')
      );
  }
}

export function eventActionsFor(
  event: EventDetail,
  now: Date,
  platformRole: SessionUser['platformRole'],
): EventAction[] {
  return ACTIONS.filter((action) => {
    if (!eventActionApplies(action.key, event, now)) return false;
    if (platformRole === 'ADMIN') return true;
    const rule = EVENT_ACTION_ROLES[action.key];
    return (
      rule.club.some((r) => event.viewerClubRoles.includes(r)) ||
      rule.event.some((r) => event.viewerResponsibilities.includes(r))
    );
  });
}

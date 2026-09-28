import { readFileSync } from 'node:fs';
import type { EventDetail } from '@majlis/contracts';
import { describe, expect, it } from 'vitest';
import { EVENT_ACTION_ROLES, eventActionApplies, eventActionsFor, type EventActionKey } from './event-actions';

const SOURCE = '../api/src/auth/permissions.ts';

const NEEDED = {
  publish: 'event:publish',
  edit: 'event:edit',
  attendees: 'registration:read',
  checkIn: 'attendance:check-in',
  certificates: 'certificate:manage',
  cancel: 'event:cancel',
} as const satisfies Record<EventActionKey, string>;

/** Entries have no nested braces, so `[^}]*` is enough. */
function apiRule(permission: string): { club: string[]; event: string[] } {
  const source = readFileSync(SOURCE, 'utf8');
  const entry = new RegExp(`'${permission}': \\{([^}]*)\\}`, 's').exec(source);
  if (!entry?.[1]) throw new Error(`${permission} is not in ${SOURCE}`);
  const list = (column: string): string[] => {
    const found = new RegExp(`${column}: \\[([^\\]]*)\\]`, 's').exec(entry[1]!);
    return (found?.[1] ?? '')
      .split(',')
      .map((r) => r.trim().replace(/'/g, ''))
      .filter((r) => r.length > 0);
  };
  return { club: list('club'), event: list('event') };
}

const NOW = new Date('2026-09-20T19:00:00.000Z');

function event(overrides: Partial<EventDetail> = {}): EventDetail {
  return {
    id: '00000000-0000-7000-8000-000000000001',
    clubId: '00000000-0000-7000-8000-000000000002',
    clubName: 'Robotics Club',
    clubSlug: 'robotics-club',
    clubLogoUrl: 'https://example.test/logo.png',
    title: 'Drone Build Night',
    slug: 'drone-build-night',
    summary: 'Assemble and fly a micro quadcopter.',
    description: 'Parts provided.',
    eventType: 'WORKSHOP',
    audience: 'ALL_STUDENTS',
    venue: 'Hangar',
    onlineUrl: null,
    bannerUrl: null,
    timezone: 'Asia/Dubai',
    // NOW sits inside this window, so the event is live unless a case moves it.
    startsAt: '2026-09-20T18:00:00.000Z',
    endsAt: '2026-09-20T21:00:00.000Z',
    registrationOpensAt: '2026-09-18T18:00:00.000Z',
    registrationClosesAt: '2026-09-20T17:00:00.000Z',
    capacity: 30,
    confirmedCount: 1,
    waitlistEnabled: true,
    requiresClubMembership: false,
    status: 'ONGOING',
    certificateEnabled: false,
    certificateTitle: null,
    certificateSignatory: null,
    attendancePolicy: 'CHECK_IN_ONLY',
    cancelledReason: null,
    viewerRegistrationStatus: null,
    viewerWaitlistPosition: null,
    viewerClubRoles: [],
    viewerResponsibilities: [],
    ...overrides,
  };
}

const keys = (e: EventDetail, platformRole: 'STUDENT' | 'ADMIN' = 'STUDENT', now = NOW) =>
  eventActionsFor(e, now, platformRole).map((a) => a.key);

describe('the action map', () => {
  it('matches the API permission by permission, both columns', () => {
    for (const [key, permission] of Object.entries(NEEDED)) {
      const rule = EVENT_ACTION_ROLES[key as EventActionKey];
      expect([key, { club: [...rule.club], event: [...rule.event] }]).toEqual([
        key,
        apiRule(permission),
      ]);
    }
  });

  it('reads columns the API does carry, so an empty parse cannot pass the test above', () => {
    expect(apiRule('registration:read')).toEqual({
      club: ['LEAD', 'VICE_LEAD'],
      event: ['EVENT_LEAD', 'OPERATIONS'],
    });
  });
});

describe('eventActionsFor', () => {
  it('gives an Operations officer check-in but never publish', () => {
    expect(keys(event({ viewerClubRoles: ['OPERATIONS'] }))).toEqual([
      'edit',
      'checkIn',
    ]);
  });

  it('gives a Vice Lead publish but NOT check-in', () => {
    // Deliberate: only an assignment grants a Vice Lead check-in.
    const draft = event({ viewerClubRoles: ['VICE_LEAD'], status: 'DRAFT' });
    expect(keys(draft)).toEqual(['publish', 'edit', 'attendees']);

    const live = event({ viewerClubRoles: ['VICE_LEAD'] });
    expect(keys(live)).not.toContain('checkIn');
  });

  it('gives a plain member holding an EVENT_LEAD assignment the roster and check-in, and nothing else', () => {
    expect(keys(event({ viewerResponsibilities: ['EVENT_LEAD'] }))).toEqual([
      'attendees',
      'checkIn',
    ]);
  });

  it("gives a Lead everything the event's state still allows", () => {
    expect(keys(event({ viewerClubRoles: ['LEAD'] }))).toEqual([
      'edit',
      'attendees',
      'checkIn',
      'cancel',
    ]);
  });

  it('gives a plain member nothing', () => {
    expect(keys(event())).toEqual([]);
  });

  it('gives an Admin holding no club role everything the state allows', () => {
    expect(keys(event(), 'ADMIN')).toEqual(['edit', 'attendees', 'checkIn', 'cancel']);
  });

  it('offers publish only on a draft', () => {
    const lead = { viewerClubRoles: ['LEAD'] } satisfies Partial<EventDetail>;
    expect(keys(event({ ...lead, status: 'DRAFT' }))).toContain('publish');
    expect(keys(event({ ...lead, status: 'PUBLISHED' }))).not.toContain('publish');
  });

  it("shuts check-in outside the event's own window, and on a draft inside it", () => {
    const lead = { viewerClubRoles: ['LEAD'] } satisfies Partial<EventDetail>;
    expect(keys(event(lead), 'STUDENT', new Date('2026-09-20T17:59:00.000Z'))).not.toContain(
      'checkIn',
    );
    expect(keys(event(lead), 'STUDENT', new Date('2026-09-20T21:01:00.000Z'))).not.toContain(
      'checkIn',
    );
    expect(keys(event({ ...lead, status: 'DRAFT' }))).not.toContain('checkIn');
  });

  it('withdraws edit and cancel as the event reaches the end of its life', () => {
    const lead = { viewerClubRoles: ['LEAD'] } satisfies Partial<EventDetail>;
    const after = new Date('2026-09-20T22:00:00.000Z');
    expect(keys(event({ ...lead, status: 'COMPLETED' }), 'STUDENT', after)).toEqual([
      'attendees',
      'cancel',
    ]);
    expect(keys(event({ ...lead, status: 'CANCELLED' }), 'STUDENT', after)).toEqual(['attendees']);
    expect(keys(event({ ...lead, status: 'CERTIFIED' }), 'STUDENT', after)).toEqual(['attendees']);
  });

  it('offers certificates to any core-team role once a certifying event has finished', () => {
    const after = new Date('2026-09-20T22:00:00.000Z');
    const done = { status: 'COMPLETED', certificateEnabled: true } satisfies Partial<EventDetail>;
    expect(keys(event({ ...done, viewerClubRoles: ['MARKETING'] }), 'STUDENT', after)).toEqual([
      'certificates',
    ]);
    expect(keys(event({ ...done, status: 'CERTIFIED', viewerClubRoles: ['CTO'] }), 'STUDENT', after)).toEqual([
      'certificates',
    ]);
    expect(keys(event({ certificateEnabled: true, viewerClubRoles: ['LEAD'] }))).not.toContain('certificates');
    expect(keys(event({ status: 'COMPLETED', viewerClubRoles: ['LEAD'] }), 'STUDENT', after)).not.toContain(
      'certificates',
    );
    expect(keys(event({ ...done, viewerResponsibilities: ['EVENT_LEAD'] }), 'STUDENT', after)).not.toContain(
      'certificates',
    );
  });
});

describe('eventActionApplies', () => {
  // Pickers hold an EventSummary with no viewer roles, so only the state half applies.
  it('lists an event for check-in only while it runs', () => {
    expect(eventActionApplies('checkIn', event(), NOW)).toBe(true);
    expect(eventActionApplies('checkIn', event({ status: 'PUBLISHED', startsAt: '2026-09-21T18:00:00.000Z', endsAt: '2026-09-21T21:00:00.000Z' }), NOW)).toBe(false);
  });

  it('lists an event for certificates only once issuing could succeed', () => {
    expect(eventActionApplies('certificates', event({ status: 'COMPLETED', certificateEnabled: true }), NOW)).toBe(true);
    expect(eventActionApplies('certificates', event({ status: 'COMPLETED', certificateEnabled: false }), NOW)).toBe(false);
    expect(eventActionApplies('certificates', event({ status: 'ONGOING', certificateEnabled: true }), NOW)).toBe(false);
    const { certificateEnabled: _, ...summary } = event({ status: 'COMPLETED' });
    expect(eventActionApplies('certificates', summary, NOW)).toBe(true);
  });
});

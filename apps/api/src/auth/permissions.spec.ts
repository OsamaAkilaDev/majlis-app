import { describe, expect, it } from 'vitest';
import type { ActorFacts, Permission } from './permissions';
import { evaluate, matches } from './permissions';

const student: ActorFacts = {
  userId: 'u1',
  platformRole: 'STUDENT',
  clubRoles: [],
  eventResponsibilities: [],
};
const admin: ActorFacts = { ...student, platformRole: 'ADMIN' };

describe('evaluate', () => {
  it('grants user:suspend to an Admin', () => {
    // Catches: platform rule never checked, or ADMIN missing from the row.
    expect(evaluate('user:suspend', admin)).toBe(true);
  });

  it('denies user:suspend to a student', () => {
    // Catches: rule matched regardless of role (always-true evaluate).
    expect(evaluate('user:suspend', student)).toBe(false);
  });

  it('denies user:suspend to a Club Lead: club authority is not platform authority', () => {
    // Catches: club rules satisfying a platform-only rule.
    expect(evaluate('user:suspend', { ...student, clubRoles: ['LEAD'] })).toBe(false);
  });

  it('denies an unknown permission rather than defaulting open', () => {
    // Catches fail-open: a typo in @RequirePermission falling through to true.
    expect(evaluate('nonexistent:action' as Permission, admin)).toBe(false);
  });
});

describe('matches', () => {
  it('has no implicit Admin superuser branch', () => {
    // Catches a blanket `if (platformRole === 'ADMIN') return true` shortcut.
    expect(matches({ club: ['LEAD'] }, admin)).toBe(false);
  });

  it('grants when the actor holds a listed club role', () => {
    // Catches: the wrong actor field, or `.some` inverted to require all roles.
    expect(matches({ club: ['LEAD', 'CTO'] }, { ...student, clubRoles: ['CTO'] })).toBe(true);
  });

  it('grants when the actor holds a listed event responsibility', () => {
    // Catches: the event branch missing, or checking clubRoles instead.
    expect(
      matches({ event: ['OPERATIONS'] }, { ...student, eventResponsibilities: ['OPERATIONS'] }),
    ).toBe(true);
  });

  it('denies when no branch matches', () => {
    // Catches: a branch returning true unconditionally, or the false fallthrough removed.
    expect(matches({ platform: ['ADMIN'], club: ['LEAD'], event: ['EVENT_LEAD'] }, student)).toBe(
      false,
    );
  });
});

describe('club permission rows', () => {
  const asClub = (roles: ActorFacts['clubRoles']): ActorFacts => ({ ...student, clubRoles: roles });
  const asEvent = (roles: ActorFacts['eventResponsibilities']): ActorFacts => ({
    ...student,
    eventResponsibilities: roles,
  });

  it('reserves club creation, status and Lead appointment to Admin', () => {
    for (const p of ['club:create', 'club:status', 'club:appoint-lead', 'department:manage'] as const) {
      expect(evaluate(p, admin)).toBe(true);
      // Catches a copy-pasted `club: ['LEAD']`.
      expect(evaluate(p, asClub(['LEAD']))).toBe(false);
      expect(evaluate(p, student)).toBe(false);
    }
  });

  it('gives team management to Lead but not to Vice Lead', () => {
    // Catches `club: ['LEAD', 'VICE_LEAD']`.
    expect(evaluate('club:team-manage', asClub(['LEAD']))).toBe(true);
    expect(evaluate('club:team-manage', asClub(['VICE_LEAD']))).toBe(false);
    expect(evaluate('club:team-manage', admin)).toBe(true);
  });

  it('gives membership decisions to Lead, Vice Lead and Operations only', () => {
    for (const role of ['LEAD', 'VICE_LEAD', 'OPERATIONS'] as const) {
      expect(evaluate('membership:decide', asClub([role]))).toBe(true);
    }
    // Catches a rule that admits every club role.
    expect(evaluate('membership:decide', asClub(['MARKETING']))).toBe(false);
    expect(evaluate('membership:decide', asClub(['CTO']))).toBe(false);
  });

  it('admits Lead, Vice Lead and Marketing to club editing but never CTO', () => {
    // CLUB_FIELDS limits Marketing's keys; no Club column is technical, so CTO stays out.
    expect(evaluate('club:edit', asClub(['LEAD']))).toBe(true);
    expect(evaluate('club:edit', asClub(['VICE_LEAD']))).toBe(true);
    expect(evaluate('club:edit', asClub(['MARKETING']))).toBe(true);
    expect(evaluate('club:edit', asClub(['CTO']))).toBe(false);
  });

  it('keeps event creation and cancellation narrower than event editing', () => {
    // Catches giving every club role every event permission.
    expect(evaluate('event:edit', asClub(['OPERATIONS']))).toBe(true);
    expect(evaluate('event:create', asClub(['OPERATIONS']))).toBe(false);
    expect(evaluate('event:cancel', asClub(['VICE_LEAD']))).toBe(false);
    expect(evaluate('event:cancel', asClub(['LEAD']))).toBe(true);
    expect(evaluate('event:assign', asClub(['MARKETING']))).toBe(false);
  });

  it('grants attendee personal data to an assigned Operations officer and never to Marketing', () => {
    // Operations gets it through an EventAssignment, not a club appointment.
    expect(evaluate('registration:read', asClub(['OPERATIONS']))).toBe(false);
    expect(evaluate('registration:read', asEvent(['OPERATIONS']))).toBe(true);
    expect(evaluate('registration:read', asClub(['MARKETING']))).toBe(false);
    expect(evaluate('registration:read', asEvent(['MARKETING']))).toBe(false);
  });

  it('lets Lead and Operations check people in, by appointment or assignment, but not Vice Lead', () => {
    expect(evaluate('attendance:check-in', asClub(['LEAD']))).toBe(true);
    expect(evaluate('attendance:check-in', asClub(['OPERATIONS']))).toBe(true);
    expect(evaluate('attendance:check-in', asEvent(['EVENT_LEAD']))).toBe(true);
    expect(evaluate('attendance:check-in', asEvent(['OPERATIONS']))).toBe(true);
    expect(evaluate('attendance:check-in', asClub(['VICE_LEAD']))).toBe(false);
    expect(evaluate('attendance:check-in', asEvent(['MARKETING']))).toBe(false);
  });
});

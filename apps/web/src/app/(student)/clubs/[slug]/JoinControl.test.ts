import type { ClubDetail } from '@majlis/contracts';
import { describe, expect, it } from 'vitest';
import { decide } from './JoinControl';

function club(overrides: Partial<ClubDetail> = {}): ClubDetail {
  return {
    id: '00000000-0000-7000-8000-000000000001',
    slug: 'robotics',
    name: 'Robotics Society',
    category: 'Technology',
    logoUrl: 'https://example.test/logo.png',
    status: 'ACTIVE',
    membershipPolicy: 'OPEN',
    departmentName: 'Engineering',
    memberCount: 1,
    viewerJoined: false,
    description: 'A club.',
    academicYear: '2026/2027',
    bannerUrl: null,
    departmentId: '00000000-0000-7000-8000-000000000002',
    viewerMembershipStatus: null,
    viewerClubRoles: [],
    committee: [],
    pendingMemberCount: null,
    eventsRun: 0,
    ...overrides,
  };
}

describe('decide', () => {
  it('states the policy in the label of the one control', () => {
    expect(decide(club({ membershipPolicy: 'OPEN' })).label).toBe('Join club');
    expect(decide(club({ membershipPolicy: 'APPROVAL_REQUIRED' })).label).toBe('Request to join');
    expect(decide(club({ membershipPolicy: 'INVITE_ONLY' })).label).toBe('Invite only');
    expect(decide(club({ membershipPolicy: 'CLOSED' })).label).toBe('Joining closed');
  });

  it('blocks the two policies that admit nobody, and only those two', () => {
    expect(decide(club({ membershipPolicy: 'INVITE_ONLY' })).kind).toBe('blocked');
    expect(decide(club({ membershipPolicy: 'CLOSED' })).kind).toBe('blocked');
    expect(decide(club({ membershipPolicy: 'OPEN' })).kind).toBe('join');
    expect(decide(club({ membershipPolicy: 'APPROVAL_REQUIRED' })).kind).toBe('request');
  });

  it('puts the viewer relationship ahead of the policy', () => {
    expect(decide(club({ viewerMembershipStatus: 'ACTIVE' })).kind).toBe('leave');
    expect(decide(club({ viewerMembershipStatus: 'PENDING' })).kind).toBe('withdraw');
    expect(decide(club({ viewerMembershipStatus: 'REMOVED' })).kind).toBe('blocked');
  });

  it('offers a CTO with no membership row the ordinary way in', () => {
    // CTO is the one appointed role with no Manage section, so it reaches this control; roles are not memberships.
    expect(
      decide(
        club({
          viewerClubRoles: ['CTO'],
          viewerMembershipStatus: null,
          membershipPolicy: 'APPROVAL_REQUIRED',
        }),
      ).kind,
    ).toBe('request');
    expect(decide(club({ viewerClubRoles: ['CTO'], viewerMembershipStatus: 'ACTIVE' })).kind).toBe(
      'leave',
    );
  });

  it('treats LEFT and REJECTED as not a member, not as a refusal', () => {
    expect(decide(club({ viewerMembershipStatus: 'LEFT' })).kind).toBe('join');
    expect(decide(club({ viewerMembershipStatus: 'REJECTED' })).kind).toBe('join');
  });

  it('shuts joining on a club that is not active', () => {
    const decision = decide(club({ status: 'SUSPENDED' }));
    expect(decision.kind).toBe('blocked');
    expect(decision.why).toContain('suspended');
  });

  it('names every blocked control for a screen reader', () => {
    for (const c of [
      club({ membershipPolicy: 'INVITE_ONLY' }),
      club({ membershipPolicy: 'CLOSED' }),
      club({ viewerMembershipStatus: 'REMOVED' }),
      club({ status: 'ARCHIVED' }),
    ]) {
      expect(decide(c).why).toBeTruthy();
    }
  });
});

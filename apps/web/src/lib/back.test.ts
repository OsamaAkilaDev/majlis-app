import type { SessionUser } from '@majlis/contracts';
import { describe, expect, it } from 'vitest';
import { backFallback, isTabRoot } from './back';

function user(platformRole: SessionUser['platformRole']): SessionUser {
  return {
    id: 'u1',
    email: 'a@b.com',
    fullName: 'A',
    avatarUrl: null,
    platformRole,
    clubRoles: [],
  };
}

describe('isTabRoot', () => {
  it('names the three roots the dock can reach', () => {
    // Back from a tab root leaves the app.
    expect(isTabRoot('/events')).toBe(true);
    expect(isTabRoot('/clubs')).toBe(true);
  });

  it('names the five sections the admin sidebar can reach', () => {
    // Back from a sidebar section has nowhere to go.
    expect(isTabRoot('/admin/users')).toBe(true);
    expect(isTabRoot('/admin/departments')).toBe(true);
    expect(isTabRoot('/admin/clubs')).toBe(true);
    expect(isTabRoot('/admin/events')).toBe(true);
    expect(isTabRoot('/admin/audit')).toBe(true);
  });

  it('does not mistake a child for its root', () => {
    // The discriminating case: a startsWith match passes everything above and drops back from every detail screen.
    expect(isTabRoot('/events/discover')).toBe(false);
    expect(isTabRoot('/events/abc-123')).toBe(false);
    expect(isTabRoot('/clubs/discover')).toBe(false);
    expect(isTabRoot('/clubs/robotics-club')).toBe(false);
    expect(isTabRoot('/profile')).toBe(false);
    expect(isTabRoot('/profile/registrations')).toBe(false);
    expect(isTabRoot('/admin/clubs/new')).toBe(false);
  });

  it('ignores a trailing slash', () => {
    expect(isTabRoot('/clubs/')).toBe(true);
  });
});

describe('backFallback', () => {
  it('returns to the tab a deep link opened under', () => {
    // Catches an implementation that always falls back to landingFor.
    expect(backFallback('/events/abc-123', user('STUDENT'))).toBe('/events');
    expect(backFallback('/clubs/robotics-club', user('STUDENT'))).toBe('/clubs');
  });

  it('falls back to the viewer\'s landing outside any tab', () => {
    expect(backFallback('/profile/notifications', user('STUDENT'))).toBe('/events');
  });

  it('returns to the admin section a deep link opened under', () => {
    expect(backFallback('/admin/clubs/new', user('ADMIN'))).toBe('/admin/clubs');
  });

  it('does not loop the console landing page back to itself', () => {
    // /admin redirects to /admin/users, so falling back to it would loop.
    expect(backFallback('/admin/users', user('ADMIN'))).toBe('/admin/users');
  });
});

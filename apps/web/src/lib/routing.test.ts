import { describe, expect, it } from 'vitest';
import type { SessionUser } from '@majlis/contracts';
import {
  activeNavHref,
  consoleRedirect,
  decideRedirect,
  landingFor,
  shellDestinations,
} from './routing';

const user = (over: Partial<SessionUser> = {}): SessionUser => ({
  id: 'u1',
  email: 'a@uni.ac.ae',
  fullName: 'A Student',
  avatarUrl: null,
  platformRole: 'STUDENT',
  clubRoles: [],
  ...over,
});

describe('landingFor', () => {
  it('sends every non-admin to events, officer or not', () => {
    expect(landingFor(user())).toBe('/events');
    expect(landingFor(user({ clubRoles: [{ clubId: 'c1', clubName: 'Robotics', role: 'LEAD' }] })))
      .toBe('/events');
    expect(landingFor(user({ platformRole: 'ADMIN' }))).toBe('/admin');
  });
});

describe('decideRedirect', () => {
  const anon = { hasSession: false };
  const live = { hasSession: true };

  it('sends an anonymous visitor from a protected route to /login', () => {
    expect(decideRedirect({ pathname: '/home', ...anon })).toEqual({ to: '/login' });
  });

  it('lets a signed-in visitor through a protected route', () => {
    expect(decideRedirect({ pathname: '/home', ...live })).toBeNull();
  });

  it('never bounces a visitor off /login, however signed-in their cookies look', () => {
    // A rejected cookie still reads as a session, so bouncing /login loops forever.
    expect(decideRedirect({ pathname: '/login', ...live })).toBeNull();
    expect(decideRedirect({ pathname: '/signup', ...live })).toBeNull();
  });

  it('leaves an anonymous visitor on /login', () => {
    expect(decideRedirect({ pathname: '/login', ...anon })).toBeNull();
  });

  it('never gates the password reset routes, signed in or not', () => {
    expect(decideRedirect({ pathname: '/forgot-password', ...anon })).toBeNull();
    expect(decideRedirect({ pathname: '/reset-password', ...anon })).toBeNull();
    // A link requested on a phone may be opened on a laptop that is still signed in.
    expect(decideRedirect({ pathname: '/reset-password', ...live })).toBeNull();
    expect(decideRedirect({ pathname: '/forgot-password', ...live })).toBeNull();
  });

  it('does not treat /loginary as the login route', () => {
    expect(decideRedirect({ pathname: '/loginary', ...anon })).toEqual({ to: '/login' });
  });
});

describe('shellDestinations', () => {
  it('gives a club officer no shell destination at all', () => {
    expect(shellDestinations(user({ clubRoles: [{ clubId: 'c1', clubName: 'Robotics', role: 'LEAD' }] })))
      .toEqual([]);
  });

  it('gives an admin exactly one', () => {
    expect(shellDestinations(user({ platformRole: 'ADMIN' }))).toEqual([
      { href: '/admin', label: 'Admin' },
    ]);
  });
});

describe('consoleRedirect', () => {
  it('sends a club officer out of the console and leaves an admin in it', () => {
    const lead = user({ clubRoles: [{ clubId: 'c1', clubName: 'Robotics', role: 'LEAD' }] });
    expect(consoleRedirect(lead, 'robotics')).toBe('/clubs/robotics');
    expect(consoleRedirect(user({ platformRole: 'ADMIN' }), 'robotics')).toBeNull();
  });

  it('sends an officer to the club list when the club could not be read', () => {
    expect(consoleRedirect(user(), null)).toBe('/clubs');
  });
});

describe('activeNavHref', () => {
  const TABS = ['/events', '/clubs'];

  it('lights the tab for its own route', () => {
    expect(activeNavHref('/events', TABS)).toBe('/events');
    expect(activeNavHref('/clubs', TABS)).toBe('/clubs');
  });

  it('lights a tab on its deep routes', () => {
    expect(activeNavHref('/clubs/robotics-club', TABS)).toBe('/clubs');
    expect(activeNavHref('/events/e9', TABS)).toBe('/events');
  });

  it('lights the longest matching href, not the first', () => {
    const NESTED = ['/manage/c1', '/manage/c1/events'];
    expect(activeNavHref('/manage/c1/events/e9', NESTED)).toBe('/manage/c1/events');
    expect(activeNavHref('/manage/c1/members', NESTED)).toBe('/manage/c1');
  });

  it('lights no tab on the profile screens, which left the tab bar', () => {
    expect(activeNavHref('/profile', TABS)).toBeNull();
    expect(activeNavHref('/profile/registrations', TABS)).toBeNull();
    expect(activeNavHref('/profile/notifications', TABS)).toBeNull();
  });

  it('lights nothing for a route that is not under any tab', () => {
    expect(activeNavHref('/admin/users', TABS)).toBeNull();
  });
});

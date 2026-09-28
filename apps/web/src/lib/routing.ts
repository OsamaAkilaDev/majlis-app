import type { SessionUser } from '@majlis/contracts';

// Must match the API: `__Host-` needs HTTPS, so production only.
const HOST_PREFIX = process.env.NODE_ENV === 'production' ? '__Host-' : '';

export const SESSION_COOKIE = `${HOST_PREFIX}majlis_session`;

// Never bounced from proxy: reset links must work while signed in.
const AUTH_ROUTES = ['/login', '/signup', '/forgot-password', '/reset-password'];

export function landingFor(user: SessionUser): string {
  return user.platformRole === 'ADMIN' ? '/admin' : '/events';
}

/** The longest href that prefixes `pathname`, so a deep route lights its nearest entry. */
export function activeNavHref(pathname: string, hrefs: readonly string[]): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    if (!isUnder(pathname, href)) continue;
    if (best === null || href.length > best.length) best = href;
  }
  return best;
}

export type ShellDestination = { href: string; label: string; meta?: string };

export function shellDestinations(user: SessionUser): ShellDestination[] {
  return user.platformRole === 'ADMIN' ? [{ href: '/admin', label: 'Admin' }] : [];
}

/** The console is Admin-only; officers work on the club page. Null means stay. */
export function consoleRedirect(user: SessionUser, clubSlug: string | null): string | null {
  if (user.platformRole === 'ADMIN') return null;
  return clubSlug ? `/clubs/${clubSlug}` : '/clubs';
}

function isUnder(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function decideRedirect(input: { pathname: string; hasSession: boolean }): { to: string } | null {
  const { pathname, hasSession } = input;

  // Cookie presence is not a session: bouncing auth routes on it loops on a dead cookie.
  if (AUTH_ROUTES.includes(pathname)) return null;
  return hasSession ? null : { to: '/login' };
}

import type { CookieOptions } from 'express';

/**
 * `__Host-` stops a sibling subdomain overwriting the cookie. Production only: over plain HTTP it is dropped.
 * Must match `apps/web/src/lib/routing.ts` or middleware stops seeing the session.
 */
export function hostPrefix(nodeEnv: string | undefined): string {
  return nodeEnv === 'production' ? '__Host-' : '';
}

export const SESSION_COOKIE = `${hostPrefix(process.env.NODE_ENV)}majlis_session`;

/** Not `=== 'production'`: a staging deploy with NODE_ENV=test must still get Secure cookies. */
export function secureCookies(nodeEnv: string): boolean {
  return nodeEnv !== 'development';
}

export function sessionCookieOptions(secure: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
  };
}

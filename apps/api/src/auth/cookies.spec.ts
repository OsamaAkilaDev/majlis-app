import { describe, expect, it } from 'vitest';
import { secureCookies, sessionCookieOptions } from './cookies';

describe('secureCookies', () => {
  it('is false in development, so localhost works over http', () => {
    expect(secureCookies('development')).toBe(false);
  });

  it('is true in production', () => {
    expect(secureCookies('production')).toBe(true);
  });

  it('is true in test: a staging deploy running NODE_ENV=test must still ship Secure cookies', () => {
    // Catches an `=== 'production'` check, which leaves a NODE_ENV=test staging deploy insecure.
    expect(secureCookies('test')).toBe(true);
  });

  it('is true for any value that is not literally "development"', () => {
    expect(secureCookies('staging')).toBe(true);
  });
});

describe('sessionCookieOptions', () => {
  it('sets Secure outside development', () => {
    expect(sessionCookieOptions(true).secure).toBe(true);
  });

  it('leaves Secure off in development, so localhost works over http', () => {
    expect(sessionCookieOptions(false).secure).toBe(false);
  });

  it('is httpOnly and SameSite=Lax in both modes', () => {
    for (const opts of [sessionCookieOptions(true), sessionCookieOptions(false)]) {
      expect(opts.httpOnly).toBe(true);
      expect(opts.sameSite).toBe('lax');
    }
  });

  it('scopes the session cookie to the whole app', () => {
    expect(sessionCookieOptions(true).path).toBe('/');
  });
});

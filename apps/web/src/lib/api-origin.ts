/** Server-side only. Never derive from request headers: a spoofed Host would receive the cookie. */
function resolve(): string {
  const origin = process.env.API_ORIGIN;
  if (origin) return origin;

  // A localhost fallback in production fails login with no readable error.
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'API_ORIGIN must be set in production: it is the origin /api/v1 requests are rewritten to.',
    );
  }
  return 'http://localhost:3001';
}

export const API_ORIGIN = resolve();

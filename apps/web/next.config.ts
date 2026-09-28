import type { NextConfig } from 'next';

// Duplicated from src/lib/api-origin.ts: next.config.ts loads before the module graph, so it cannot import from src.
function apiOrigin(): string {
  const origin = process.env.API_ORIGIN;
  if (origin) return origin;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'API_ORIGIN must be set in production: it is the origin /api/v1 requests are rewritten to.',
    );
  }
  return 'http://localhost:3001';
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${apiOrigin()}/api/v1/:path*` }];
  },
  /** No CSP yet: inline styles and a server-rendered inline SVG make any useful policy need a nonce plumbed through the render. */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};

export default nextConfig;

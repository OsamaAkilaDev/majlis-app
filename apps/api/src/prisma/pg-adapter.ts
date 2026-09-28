import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Session timezone pinned to UTC: otherwise a non-UTC server stores the wall clock, not the
 * instant, and Prisma's round trip hides it. Set via `options`, not the connection string.
 */
export function pgAdapter(connectionString: string): PrismaPg {
  return new PrismaPg({ connectionString, options: '-c timezone=UTC' });
}

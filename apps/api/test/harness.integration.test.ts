import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestPrisma, truncateAll } from './db';
import { testDb } from './factories';

// Assigning undefined to process.env stores the string 'undefined'.
function restore(saved: string | undefined): void {
  if (saved === undefined) delete process.env.TEST_DATABASE_URL;
  else process.env.TEST_DATABASE_URL = saved;
}

const prisma = testDb();

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await truncateAll(prisma);
});

describe('integration test harness', () => {
  it('connects to the test database and it is Postgres 17 or newer, what Supabase runs', async () => {
    const rows = await prisma.$queryRaw<{ v: number }[]>`SELECT current_setting('server_version_num')::int AS v`;
    expect(rows[0]!.v).toBeGreaterThanOrEqual(170000);
  });

  it('is pointed at majlis_test, never at the development database', async () => {
    const rows = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
    expect(rows[0]!.db).toBe('majlis_test');
  });

  it('refuses a connection string that does not name the test database', async () => {
    const saved = process.env.TEST_DATABASE_URL;
    try {
      process.env.TEST_DATABASE_URL = 'postgresql://majlis:majlis@localhost:5432/majlis_dev';
      expect(() => createTestPrisma()).toThrow(/non-test database/);
    } finally {
      restore(saved);
    }
  });

  it('refuses a connection string where "majlis_test" appears only in the username, not the database name', async () => {
    // The username matches majlis_test while the database is majlis_prod; only a parsed pathname catches it.
    const saved = process.env.TEST_DATABASE_URL;
    try {
      process.env.TEST_DATABASE_URL = 'postgresql://majlis_test_ro:pw@prod-host:5432/majlis_prod';
      expect(() => createTestPrisma()).toThrow(/non-test database/);
    } finally {
      restore(saved);
    }
  });

  it('truncateAll is idempotent', async () => {
    // beforeEach already truncated, so this proves truncating twice does not error.
    await expect(truncateAll(prisma)).resolves.toBeUndefined();
    await expect(truncateAll(prisma)).resolves.toBeUndefined();
  });
});

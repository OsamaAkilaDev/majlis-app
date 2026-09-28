import { Client } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { testDatabaseUrl, truncateAll } from './db';
import { aUser, testDb } from './factories';

const prisma = testDb();

afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll(prisma);
});

/** Midsummer noon UTC, so no DST rule anywhere can account for a shift. */
const INSTANT = new Date('2026-06-15T12:00:00.000Z');

describe('timestamp storage', () => {
  // A Prisma read-back hides an offset; extract(epoch) on a fresh pg connection sees the stored instant.
  it('stores the instant Prisma was given, not its wall clock', async () => {
    const user = await prisma.user.create({ data: { ...aUser(), createdAt: INSTANT } });

    const client = new Client({ connectionString: testDatabaseUrl() });
    await client.connect();
    try {
      const { rows } = await client.query<{ epoch: string }>(
        'SELECT extract(epoch from "created_at") AS epoch FROM "user" WHERE "id" = $1',
        [user.id],
      );
      expect(Number(rows[0]?.epoch)).toBe(INSTANT.getTime() / 1000);
    } finally {
      await client.end();
    }
  });
});

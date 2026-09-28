import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { truncateAll } from '../db';
import { mkUser, testDb } from '../factories';

const prisma = testDb();

afterAll(async () => { await prisma.$disconnect(); });
beforeEach(async () => { await truncateAll(prisma); });

describe('User', () => {
  it('assigns a UUID v7 id, which is time-sortable', async () => {
    const first = await mkUser();
    await new Promise((r) => setTimeout(r, 5));
    const second = await mkUser();

    // Version nibble of a UUID v7 sits at index 14.
    expect(first.id[14]).toBe('7');
    expect(first.id < second.id).toBe(true);
  });

  it('defaults to an ACTIVE student', async () => {
    const user = await mkUser();
    expect(user.status).toBe('ACTIVE');
    expect(user.platformRole).toBe('STUDENT');
  });

  it('rejects a duplicate email', async () => {
    await mkUser({ email: 'dupe@uni.ac.ae' });
    await expect(mkUser({ email: 'dupe@uni.ac.ae' })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('rejects an email that is not already lowercased', async () => {
    await expect(mkUser({ email: 'Mixed@Uni.ac.ae' })).rejects.toThrow(/user_email_lowercase/);
  });

  it('stores createdAt as timestamptz', async () => {
    const rows = await prisma.$queryRaw<{ data_type: string }[]>`
      SELECT data_type FROM information_schema.columns
      WHERE table_name = 'user' AND column_name = 'created_at'`;
    expect(rows[0]!.data_type).toBe('timestamp with time zone');
  });
});

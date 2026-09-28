import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../app';
import { login, signup } from '../auth-helpers';
import { truncateAll } from '../db';
import { testDb, uniq } from '../factories';

const prisma = testDb();
let app: INestApplication;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await truncateAll(prisma);
});

/** The whole row as text, so the check does not depend on what the password column is called. */
async function storedRow(email: string): Promise<string> {
  const rows = await prisma.$queryRaw<{ row: string }[]>`
    SELECT row_to_json(u)::text AS row FROM "user" u WHERE u.email = ${email}`;
  return rows[0]!.row;
}

function longStrings(row: string): string[] {
  return Object.values(JSON.parse(row) as Record<string, unknown>).filter(
    (v): v is string => typeof v === 'string' && v.length >= 20 && !/^\d{4}-\d\d-\d\dT/.test(v),
  );
}

describe('passwords at rest', () => {
  it('never stores the password as typed', async () => {
    const email = `${uniq('user')}@uni.ac.ae`;
    await signup(app, { email, password: 'correct-horse-battery' }).expect(201);

    expect(await storedRow(email)).not.toContain('correct-horse-battery');
  });

  it('stores two accounts with the same password differently', async () => {
    // An unsalted hash stores the same value for both.
    const a = `${uniq('a')}@uni.ac.ae`;
    const b = `${uniq('b')}@uni.ac.ae`;
    await signup(app, { email: a, password: 'correct-horse-battery' }).expect(201);
    await signup(app, { email: b, password: 'correct-horse-battery' }).expect(201);

    const fromB = longStrings(await storedRow(b));
    expect(longStrings(await storedRow(a)).filter((v) => fromB.includes(v))).toEqual([]);
  });

  it('still signs in with the right password and refuses a wrong one', async () => {
    const email = `${uniq('user')}@uni.ac.ae`;
    await signup(app, { email, password: 'correct-horse-battery' }).expect(201);

    await login(app, { email, password: 'correct-horse-battery' }).expect(200);
    await login(app, { email, password: 'correct-horse-batterx' }).expect(401);
  });
});

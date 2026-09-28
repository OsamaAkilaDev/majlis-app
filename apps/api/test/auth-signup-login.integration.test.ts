import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { login, loginAsAdmin, loginAsStudent, signup } from './auth-helpers';
import { createTestApp } from './app';
import { truncateAll } from './db';
import { testDb, uniq } from './factories';

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

describe('POST /auth/signup', () => {
  it('creates a session user with no password anywhere in the response', async () => {
    const res = await signup(app, {});
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      email: expect.stringContaining('@uni.ac.ae'),
      fullName: 'Test Person',
      platformRole: 'STUDENT',
      clubRoles: [],
    });
    expect(res.body.password).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('correct-horse-battery');
  });

  it('sets the session cookie httpOnly and scoped to the whole site', async () => {
    const res = await signup(app, {});
    const cookies = res.headers['set-cookie'] as unknown as string[];
    const session = cookies.find((c) => c.startsWith('majlis_session'));
    expect(session).toMatch(/HttpOnly/);
    expect(session).toMatch(/Path=\/(;|$)/);
  });

  it('rejects a duplicate email with 409, not 500', async () => {
    const email = `${uniq('dupe')}@uni.ac.ae`;
    const first = await signup(app, { email });
    expect(first.status).toBe(201);

    const second = await signup(app, { email });
    // Catches unhandled unique violations, which 500 and may describe the constraint.
    expect(second.status).toBe(409);
  });

  it('resolves a concurrent duplicate signup to exactly one 201 and one 409', async () => {
    // Promise.all forces the race; the unique index, not the try/catch, serialises it.
    const email = `${uniq('race')}@uni.ac.ae`;
    const [a, b] = await Promise.all([signup(app, { email }), signup(app, { email })]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
  });

  it('rejects an 11-character password, one below the minimum', async () => {
    // Catches a `.min(11)` typo, which a vaguer "some short password" misses.
    const res = await signup(app, { password: 'a'.repeat(11) });
    expect(res.status).toBe(400);
  });

  it('accepts a 12-character password, exactly at the minimum', async () => {
    const res = await signup(app, { password: 'a'.repeat(12) });
    expect(res.status).toBe(201);
  });

  it('writes no audit row for a routine signup', async () => {
    // Signup is deliberately not audited.
    await signup(app, {});
    const count = await prisma.auditLog.count();
    expect(count).toBe(0);
  });
});

describe('POST /auth/login', () => {
  it('logs in when the email case differs from what was stored', async () => {
    await signup(app, { email: 'osama@uni.ac.ae', password: 'correct-horse-battery' });

    const res = await login(app, { email: 'Osama@UNI.ac.ae', password: 'correct-horse-battery' });

    // Catches a lookup skipping emailSchema normalisation, which reads like a wrong password.
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('osama@uni.ac.ae');
  });

  it('gives a byte-identical response for an unknown email and a wrong password', async () => {
    await signup(app, { email: 'known@uni.ac.ae', password: 'correct-horse-battery' });

    const unknownEmailRes = await login(app, { email: 'nobody@uni.ac.ae', password: 'whatever-at-all' });
    const wrongPasswordRes = await login(app, { email: 'known@uni.ac.ae', password: 'whatever-at-all' });

    expect(unknownEmailRes.status).toBe(401);
    expect(wrongPasswordRes.status).toBe(401);

    // requestId differs, so toEqual compares two real responses; a differing `detail` is an enumeration bug.
    const { requestId: unknownRequestId, ...unknownBody } = unknownEmailRes.body;
    const { requestId: wrongRequestId, ...wrongBody } = wrongPasswordRes.body;
    expect(unknownRequestId).not.toBe(wrongRequestId);
    expect(unknownBody).toEqual(wrongBody);
  });

  it('tells a suspended user they are suspended, but only on the right password', async () => {
    const { userId } = await loginAsStudent(app, {
      email: 'sus@uni.ac.ae',
      password: 'correct-horse-battery',
    });
    await prisma.user.update({ where: { id: userId }, data: { status: 'SUSPENDED' } });

    const correctPassword = await login(app, { email: 'sus@uni.ac.ae', password: 'correct-horse-battery' });
    expect(correctPassword.status).toBe(403);

    const wrongPassword = await login(app, { email: 'sus@uni.ac.ae', password: 'not-the-password' });
    // Indistinguishable from an unknown email until the password is proven.
    expect(wrongPassword.status).toBe(401);

    const unknownEmail = await login(app, { email: 'nobody-else@uni.ac.ae', password: 'not-the-password' });
    const { requestId: wrongRequestId, ...wrongBody } = wrongPassword.body;
    const { requestId: unknownRequestId, ...unknownBody } = unknownEmail.body;
    expect(wrongRequestId).not.toBe(unknownRequestId);
    expect(wrongBody).toEqual(unknownBody);
  });

  it('includes the actors ACTIVE club roles in the session user', async () => {
    const club = await prisma.club.create({
      data: {
        name: `Club ${uniq('club')}`,
        slug: uniq('club'),
        description: 'A club.',
        category: 'Technology',
        academicYear: '2026/2027',
        logoUrl: 'https://example.test/logo.png',
        department: { create: { name: `Dept ${uniq('dept')}`, code: uniq('DEPT').toUpperCase() } },
      },
    });
    const otherClub = await prisma.club.create({
      data: {
        name: `Club ${uniq('club')}`,
        slug: uniq('club'),
        description: 'A club.',
        category: 'Technology',
        academicYear: '2026/2027',
        logoUrl: 'https://example.test/logo.png',
        department: { create: { name: `Dept ${uniq('dept')}`, code: uniq('DEPT').toUpperCase() } },
      },
    });
    const { userId } = await loginAsStudent(app, {
      email: 'lead@uni.ac.ae',
      password: 'correct-horse-battery',
    });
    await prisma.clubTeamAppointment.create({
      data: { clubId: club.id, userId, role: 'LEAD', status: 'ACTIVE', invitedById: userId },
    });
    // A non-ACTIVE appointment in another club, so dropping the ACTIVE filter fails.
    await prisma.clubTeamAppointment.create({
      data: { clubId: otherClub.id, userId, role: 'MARKETING', status: 'INVITED', invitedById: userId },
    });

    const res = await login(app, { email: 'lead@uni.ac.ae', password: 'correct-horse-battery' });

    // Catches ignoring appointments, surfacing an INVITED one, or joining the wrong club.
    expect(res.body.clubRoles).toEqual([
      { clubId: club.id, clubName: club.name, role: 'LEAD' },
    ]);
  });

  it('writes no audit row for a routine login', async () => {
    await signup(app, { email: 'quiet@uni.ac.ae', password: 'correct-horse-battery' });
    await login(app, { email: 'quiet@uni.ac.ae', password: 'correct-horse-battery' });

    const count = await prisma.auditLog.count();
    expect(count).toBe(0);
  });
});

describe('loginAsAdmin test helper', () => {
  it('promotes the signed-up user so the same session cookie now carries admin authority', async () => {
    // SessionGuard re-reads the role, so the signup cookie survives the direct-write promotion.
    const { userId } = await loginAsAdmin(app, {});
    const row = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(row.platformRole).toBe('ADMIN');
  });
});

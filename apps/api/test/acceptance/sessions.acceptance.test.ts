import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SESSION_COOKIE } from '../../src/auth/cookies';
import { API_PREFIX } from '../../src/config/api-prefix';
import { createTestApp } from '../app';
import { loginAsAdmin, loginAsStudent, patchStatus, signup } from '../auth-helpers';
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

function me(cookie: string) {
  return request(app.getHttpServer()).get(`${API_PREFIX}/auth/me`).set('Cookie', cookie);
}

function sessionSetCookie(res: request.Response): string {
  const all = (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
  const found = all.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  if (!found) throw new Error('no session cookie was set');
  return found;
}

describe('the session cookie', () => {
  it('is refused when it holds nothing but a user id', async () => {
    // Anyone who can read a user id off a club page could otherwise sign in as that user.
    const victim = await loginAsStudent(app);

    const res = await me(`${SESSION_COOKIE}=${victim.userId}`);

    expect(res.status).toBe(401);
  });

  it('does not carry the user id in the clear', async () => {
    const res = await signup(app, {}).expect(201);
    const value = sessionSetCookie(res).split(';')[0]!.split('=')[1]!;

    expect(value).not.toBe(res.body.id);
    expect(decodeURIComponent(value)).not.toBe(res.body.id);
  });

  it('is refused once a single character of it is changed', async () => {
    const user = await loginAsStudent(app);
    // A middle character, changed to one that differs in any case.
    const cookie = user.sessionCookie;
    let i = Math.floor((cookie.indexOf('=') + cookie.length) / 2);
    while (!/[a-z0-9]/i.test(cookie[i]!)) i += 1;
    const swap = cookie[i]!.toLowerCase() === 'a' ? 'b' : 'a';
    const tampered = cookie.slice(0, i) + swap + cookie.slice(i + 1);

    await me(user.sessionCookie).expect(200);
    await me(tampered).expect(401);
  });

  it('is HttpOnly', async () => {
    const cookie = sessionSetCookie(await signup(app, {}).expect(201));

    expect(cookie).toMatch(/HttpOnly/i);
  });
});

describe('ending a session', () => {
  it('stops the old cookie working after sign-out, even if it is replayed', async () => {
    // Every cookie signup set, as a browser would send them.
    const res = await signup(app, {}).expect(201);
    const jar = (res.headers['set-cookie'] as unknown as string[])
      .map((c) => c.split(';')[0])
      .join('; ');
    const session = sessionSetCookie(res).split(';')[0]!;

    await request(app.getHttpServer())
      .post(`${API_PREFIX}/auth/logout`)
      .set('Cookie', jar)
      .expect(204);

    await me(session).expect(401);
  });

  it("does not revive a suspended account's cookie when it is reinstated", async () => {
    const admin = await loginAsAdmin(app);
    const victim = await loginAsStudent(app);
    await me(victim.sessionCookie).expect(200);

    await patchStatus(app, admin.sessionCookie, victim.userId, 'SUSPENDED', 'r').expect(200);
    await patchStatus(app, admin.sessionCookie, victim.userId, 'ACTIVE', 'r').expect(200);

    await me(victim.sessionCookie).expect(401);
  });

  it('signs a user back in with a fresh cookie that works', async () => {
    const email = `${uniq('user')}@uni.ac.ae`;
    await signup(app, { email, password: 'correct-horse-battery' }).expect(201);

    const res = await request(app.getHttpServer())
      .post(`${API_PREFIX}/auth/login`)
      .send({ email, password: 'correct-horse-battery' })
      .expect(200);

    await me(sessionSetCookie(res).split(';')[0]!).expect(200);
  });
});

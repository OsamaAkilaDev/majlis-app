import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { API_PREFIX } from '../src/config/api-prefix';
import { createTestApp } from './app';
import { sessionCookieFor } from './auth-helpers';
import { truncateAll } from './db';
import { mkUser, testDb } from './factories';
import { ProtectedTestModule } from './fixtures/protected.controller';
import { registeredRoutes } from './registered-routes';

const prisma = testDb();
const PROTECTED_PATH = `${API_PREFIX}/__test/protected`;

let app: INestApplication;

beforeAll(async () => {
  // Test-only module; SessionGuard applies as AppModule's global APP_GUARD.
  app = await createTestApp([ProtectedTestModule]);
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await truncateAll(prisma);
});

describe('SessionGuard', () => {
  it('rejects a live session once the user is suspended', async () => {
    // Catches trusting the cookie without the per-request user lookup.
    const user = await mkUser();
    const cookie = await sessionCookieFor(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { status: 'SUSPENDED' } });

    const res = await request(app.getHttpServer()).get(PROTECTED_PATH).set('Cookie', cookie);
    expect(res.status).toBe(401);
  });

  it('gives a suspended user the identical rejection body a missing cookie gets', async () => {
    // Catches a more specific suspended message, which tells suspended from signed out.
    const user = await mkUser();
    const cookie = await sessionCookieFor(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { status: 'SUSPENDED' } });

    const suspended = await request(app.getHttpServer()).get(PROTECTED_PATH).set('Cookie', cookie);
    const noCookie = await request(app.getHttpServer()).get(PROTECTED_PATH);

    // requestId differs, so toEqual compares two real responses.
    const { requestId: suspendedRequestId, ...suspendedBody } = suspended.body;
    const { requestId: noCookieRequestId, ...noCookieBody } = noCookie.body;
    expect(suspendedRequestId).not.toBe(noCookieRequestId);
    expect(suspendedBody).toEqual(noCookieBody);
  });

  it('rejects a request with no session cookie at all', async () => {
    const res = await request(app.getHttpServer()).get(PROTECTED_PATH);

    expect(res.status).toBe(401);
    // Pins that a guard's UnauthorizedError still reaches ProblemExceptionFilter.
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(res.body.status).toBe(401);
  });

  it('rejects a session whose user row has been deleted', async () => {
    const user = await mkUser();
    const cookie = await sessionCookieFor(user.id);
    await prisma.user.delete({ where: { id: user.id } });

    const res = await request(app.getHttpServer()).get(PROTECTED_PATH).set('Cookie', cookie);
    expect(res.status).toBe(401); // 401, never 500
  });

  it('allows an active user with a valid session through to a protected route', async () => {
    // Positive control: a guard rejecting everything passes the tests above.
    const user = await mkUser();
    const cookie = await sessionCookieFor(user.id);

    const res = await request(app.getHttpServer()).get(PROTECTED_PATH).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: user.id });
  });

  it('allows @Public() routes without a cookie', async () => {
    const res = await request(app.getHttpServer()).get(`${API_PREFIX}/health`);
    expect(res.status).toBe(200);
  });

  it('leaves /api/v1/docs reachable without a session: Swagger mounts outside the Nest router', async () => {
    const res = await request(app.getHttpServer()).get(`${API_PREFIX}/docs`);
    expect(res.status).toBe(200);
  });

  it('protects every non-public route by default', async () => {
    // Reads the route table, so a new unprotected route fails with no test edit.
    const routes = registeredRoutes(app).filter((r) => !r.isPublic);
    expect(routes.length).toBeGreaterThan(0); // otherwise this passes vacuously

    for (const route of routes) {
      const res = await request(app.getHttpServer())[route.method](route.path);
      // 401 exactly: a 403 or 500 would mask a guard that never ran.
      expect(res.status, `${route.method.toUpperCase()} ${route.path} is unprotected`).toBe(401);
    }
  });
});

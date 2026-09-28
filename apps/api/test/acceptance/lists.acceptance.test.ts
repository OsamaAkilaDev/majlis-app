import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { API_PREFIX } from '../../src/config/api-prefix';
import { createTestApp } from '../app';
import { loginAsAdmin, loginAsStudent } from '../auth-helpers';
import { truncateAll } from '../db';
import { aDepartment, makeActiveLead, mkClub, mkEvent, testDb, uniq } from '../factories';

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

const get = (path: string, cookie: string) =>
  request(app.getHttpServer()).get(`${API_PREFIX}${path}`).set('Cookie', cookie);

const ids = (res: request.Response) => (res.body.items as { id: string }[]).map((i) => i.id);

async function fiveEvents() {
  const club = await mkClub();
  const lead = await makeActiveLead(app, club.id);
  for (let i = 0; i < 5; i += 1) await mkEvent(club.id, lead.userId, { title: `Event ${i}` });
  return loginAsStudent(app);
}

describe('pagination', () => {
  it('returns at most `limit` events and a cursor to the rest', async () => {
    const student = await fiveEvents();

    const first = await get('/events?limit=2', student.sessionCookie).expect(200);

    expect(first.body.items).toHaveLength(2);
    expect(typeof first.body.nextCursor).toBe('string');
  });

  it('walks every event exactly once and ends with a null cursor', async () => {
    const student = await fiveEvents();
    const seen: string[] = [];
    let cursor: string | null = null;

    for (let page = 0; page < 5; page += 1) {
      const res: request.Response = await get(
        `/events?limit=2${cursor ? `&cursor=${cursor}` : ''}`,
        student.sessionCookie,
      ).expect(200);
      seen.push(...ids(res));
      cursor = res.body.nextCursor;
      if (cursor === null) break;
    }

    expect(cursor).toBeNull();
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
  });

  it('refuses a limit too large to be a page', async () => {
    const student = await loginAsStudent(app);

    await get('/events?limit=5000', student.sessionCookie).expect(400);
  });

  it('pages the other long lists too', async () => {
    const admin = await loginAsAdmin(app);
    for (let i = 0; i < 3; i += 1) await mkClub();

    const clubs = await get('/clubs?limit=2', admin.sessionCookie).expect(200);
    const users = await get('/users?limit=1', admin.sessionCookie).expect(200);
    const audit = await get('/audit?limit=1', admin.sessionCookie).expect(200);

    expect(clubs.body.items).toHaveLength(2);
    expect(clubs.body).toHaveProperty('nextCursor');
    expect(users.body.items).toHaveLength(1);
    expect(audit.body).toHaveProperty('nextCursor');
  });
});

describe('search and filters', () => {
  it('finds events by title, case-insensitively', async () => {
    const club = await mkClub();
    const lead = await makeActiveLead(app, club.id);
    const robots = await mkEvent(club.id, lead.userId, { title: 'Robotics Night' });
    await mkEvent(club.id, lead.userId, { title: 'Chess Open' });
    const student = await loginAsStudent(app);

    const res = await get('/events?q=ROBOT', student.sessionCookie).expect(200);

    expect(ids(res)).toEqual([robots.id]);
  });

  it('finds clubs by name, case-insensitively', async () => {
    const target = await mkClub({ name: uniq('Robotics Society') });
    await mkClub({ name: uniq('Chess Club') });
    const student = await loginAsStudent(app);

    const res = await get('/clubs?q=robotics', student.sessionCookie).expect(200);

    expect(ids(res)).toEqual([target.id]);
  });

  it('filters clubs by department', async () => {
    const dept = await prisma.department.create({ data: aDepartment() });
    const inside = await mkClub({ departmentId: dept.id });
    await mkClub();
    const student = await loginAsStudent(app);

    const res = await get(`/clubs?departmentId=${dept.id}`, student.sessionCookie).expect(200);

    expect(ids(res)).toEqual([inside.id]);
  });

  it('filters the user directory by status', async () => {
    const admin = await loginAsAdmin(app);
    const suspended = await loginAsStudent(app);
    await prisma.user.update({ where: { id: suspended.userId }, data: { status: 'SUSPENDED' } });

    const res = await get('/users?status=SUSPENDED', admin.sessionCookie).expect(200);

    expect(ids(res)).toEqual([suspended.userId]);
  });
});

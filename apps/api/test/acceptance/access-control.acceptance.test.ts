import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { API_PREFIX } from '../../src/config/api-prefix';
import { createTestApp } from '../app';
import { loginAsAdmin, loginAsStudent } from '../auth-helpers';
import { truncateAll } from '../db';
import {
  DAY,
  HOUR,
  makeActiveLead,
  makeActiveOfficer,
  mkClub,
  mkEvent,
  mkRegistration,
  testDb,
} from '../factories';

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

describe('admin-only reads', () => {
  it('refuses the user directory to a student and serves it to an admin', async () => {
    const student = await loginAsStudent(app);
    const admin = await loginAsAdmin(app);

    await get('/users', student.sessionCookie).expect(403);
    await get('/users', admin.sessionCookie).expect(200);
  });
});

describe('club reports', () => {
  it('refuse a student with no role in the club and serve its Lead', async () => {
    const club = await mkClub();
    const lead = await makeActiveLead(app, club.id);
    const student = await loginAsStudent(app);

    await get(`/clubs/${club.id}/reports`, student.sessionCookie).expect(403);
    await get(`/clubs/${club.id}/reports`, lead.sessionCookie).expect(200);
  });
});

describe('club editing', () => {
  it('lets the club Lead edit the club profile', async () => {
    const club = await mkClub();
    const lead = await makeActiveLead(app, club.id);

    const res = await request(app.getHttpServer())
      .patch(`${API_PREFIX}/clubs/${club.id}`)
      .set('Cookie', lead.sessionCookie)
      .send({ description: 'Robots, weekly.' });

    expect(res.status).toBe(200);
    expect((await prisma.club.findUniqueOrThrow({ where: { id: club.id } })).description).toBe(
      'Robots, weekly.',
    );
  });
});

describe('manual check-in', () => {
  async function anOngoingEvent() {
    const now = Date.now();
    const club = await mkClub();
    const lead = await makeActiveLead(app, club.id);
    const event = await mkEvent(club.id, lead.userId, {
      status: 'ONGOING',
      startsAt: new Date(now - HOUR),
      endsAt: new Date(now + HOUR),
      registrationOpensAt: new Date(now - DAY),
      registrationClosesAt: new Date(now - HOUR),
      capacity: 30,
      confirmedCount: 1,
    });
    const student = await loginAsStudent(app);
    await mkRegistration(event.id, student.userId, 'CONFIRMED');
    const { email } = await prisma.user.findUniqueOrThrow({ where: { id: student.userId } });
    return { club, lead, event, email };
  }

  const checkIn = (cookie: string, eventId: string, email: string) =>
    request(app.getHttpServer())
      .post(`${API_PREFIX}/events/${eventId}/check-in/manual`)
      .set('Cookie', cookie)
      .send({ email, reason: 'At the door' });

  it('is open to the club Operations officer', async () => {
    const { club, event, email } = await anOngoingEvent();
    const ops = await makeActiveOfficer(app, club.id, 'OPERATIONS');

    const res = await checkIn(ops.sessionCookie, event.id, email);

    expect(res.status).toBe(200);
    expect(res.body.result).toBe('CHECKED_IN');
  });

  it('is open to an Operations assignment on that event', async () => {
    const { lead, event, email } = await anOngoingEvent();
    const helper = await loginAsStudent(app);
    await prisma.eventAssignment.create({
      data: {
        eventId: event.id,
        userId: helper.userId,
        responsibility: 'OPERATIONS',
        assignedById: lead.userId,
      },
    });

    const res = await checkIn(helper.sessionCookie, event.id, email);

    expect(res.status).toBe(200);
    expect(res.body.result).toBe('CHECKED_IN');
  });

  it('stays closed to a Vice Lead', async () => {
    const { club, event, email } = await anOngoingEvent();
    const vice = await makeActiveOfficer(app, club.id, 'VICE_LEAD');

    await checkIn(vice.sessionCookie, event.id, email).expect(403);
  });
});

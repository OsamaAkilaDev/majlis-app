import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { API_PREFIX } from '../../src/config/api-prefix';
import { createTestApp } from '../app';
import { loginAsStudent, type LoggedInUser } from '../auth-helpers';
import { truncateAll } from '../db';
import { DAY, HOUR, makeActiveLead, mkClub, mkEvent, mkRegistration, testDb } from '../factories';

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

async function passOf(user: LoggedInUser): Promise<string> {
  const res = await request(app.getHttpServer())
    .get(`${API_PREFIX}/me/qr-pass`)
    .set('Cookie', user.sessionCookie)
    .expect(200);
  expect(typeof res.body.token).toBe('string');
  return res.body.token as string;
}

function rotate(user: LoggedInUser) {
  return request(app.getHttpServer())
    .post(`${API_PREFIX}/me/qr-pass/rotate`)
    .set('Cookie', user.sessionCookie);
}

function scan(cookie: string, eventId: string, token: string) {
  return request(app.getHttpServer())
    .post(`${API_PREFIX}/events/${eventId}/check-in/scan`)
    .set('Cookie', cookie)
    .send({ token });
}

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
  const student = await loginAsStudent(app, { fullName: 'Layla Hassan' });
  await mkRegistration(event.id, student.userId, 'CONFIRMED');
  return { lead, event, student };
}

describe('GET /me/qr-pass', () => {
  it('gives the same pass on every read until it is rotated', async () => {
    const student = await loginAsStudent(app);

    expect(await passOf(student)).toBe(await passOf(student));
  });

  it('carries no personal data a camera could read', async () => {
    const student = await loginAsStudent(app);
    const { email } = await prisma.user.findUniqueOrThrow({ where: { id: student.userId } });

    const token = await passOf(student);

    expect(token).not.toContain(student.userId);
    expect(token).not.toContain(email);
  });
});

describe('POST /events/:eventId/check-in/scan', () => {
  it('checks a registered student in and names them for the operator', async () => {
    const { lead, event, student } = await anOngoingEvent();

    const res = await scan(lead.sessionCookie, event.id, await passOf(student)).expect(200);

    expect(res.body.result).toBe('CHECKED_IN');
    expect(res.body.fullName).toBe('Layla Hassan');
  });

  it('answers a second scan with the original time', async () => {
    const { lead, event, student } = await anOngoingEvent();
    const token = await passOf(student);

    const first = await scan(lead.sessionCookie, event.id, token).expect(200);
    const second = await scan(lead.sessionCookie, event.id, token).expect(200);

    expect(second.body.result).toBe('ALREADY_CHECKED_IN');
    expect(second.body.checkedInAt).toBe(first.body.checkedInAt);
  });

  it('records the check-in as a scan on the roster', async () => {
    const { lead, event, student } = await anOngoingEvent();
    await scan(lead.sessionCookie, event.id, await passOf(student)).expect(200);

    const roster = await request(app.getHttpServer())
      .get(`${API_PREFIX}/events/${event.id}/attendance`)
      .set('Cookie', lead.sessionCookie)
      .expect(200);

    const row = (roster.body.items as { userId: string; method: string }[]).find(
      (r) => r.userId === student.userId,
    );
    expect(row?.method).toBe('QR_SCAN');
  });

  it('refuses a pass that was rotated away, with a 200 the scanner can show', async () => {
    const { lead, event, student } = await anOngoingEvent();
    const old = await passOf(student);

    const rotated = await rotate(student).expect((r) => expect([200, 201]).toContain(r.status));
    expect(rotated.body.token).not.toBe(old);

    const res = await scan(lead.sessionCookie, event.id, old).expect(200);
    expect(res.body.result).toBe('INVALID_PASS');
    expect(await prisma.attendanceRecord.count({ where: { eventId: event.id } })).toBe(0);
  });

  it('refuses a forged or garbled pass without naming anyone', async () => {
    const { lead, event } = await anOngoingEvent();

    for (const token of ['nonsense', 'v1.AAAA.AAAA', '']) {
      const res = await scan(lead.sessionCookie, event.id, token);
      expect([200, 400]).toContain(res.status);
      if (res.status === 200) expect(res.body).toEqual({ result: 'INVALID_PASS' });
    }
  });

  it('refuses a student with no role in the club', async () => {
    const { event, student } = await anOngoingEvent();
    const stranger = await loginAsStudent(app);

    await scan(stranger.sessionCookie, event.id, await passOf(student)).expect(403);
  });
});

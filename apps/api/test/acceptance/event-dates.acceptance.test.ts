import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { API_PREFIX } from '../../src/config/api-prefix';
import { createTestApp } from '../app';
import { truncateAll } from '../db';
import { DAY, HOUR, makeActiveLead, mkClub, mkEvent, testDb } from '../factories';

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

const at = (ms: number) => new Date(Date.now() + ms).toISOString();

function body(overrides: Record<string, unknown> = {}) {
  return {
    eventId: randomUUID(),
    title: 'Robot Night',
    summary: 'Build a line follower.',
    description: 'Parts provided.',
    eventType: 'Workshop',
    audience: 'All students',
    venue: 'Hall A',
    startsAt: at(7 * DAY),
    endsAt: at(7 * DAY + 2 * HOUR),
    registrationOpensAt: at(-DAY),
    registrationClosesAt: at(6 * DAY),
    capacity: 30,
    ...overrides,
  };
}

async function create(overrides: Record<string, unknown>) {
  const club = await mkClub();
  const lead = await makeActiveLead(app, club.id);
  return request(app.getHttpServer())
    .post(`${API_PREFIX}/clubs/${club.id}/events`)
    .set('Cookie', lead.sessionCookie)
    .send(body(overrides));
}

describe('creating an event', () => {
  it('accepts a sound schedule', async () => {
    expect((await create({})).status).toBe(201);
  });

  it.each([
    ['ends when it starts', { endsAt: at(7 * DAY) }],
    ['ends before it starts', { endsAt: at(7 * DAY - HOUR) }],
    ['closes registration before opening it', { registrationClosesAt: at(-2 * DAY) }],
    [
      'closes registration when it opens',
      { registrationOpensAt: at(DAY), registrationClosesAt: at(DAY) },
    ],
    ['closes registration after the event ends', { registrationClosesAt: at(8 * DAY) }],
  ])('refuses one that %s with a 422, not a 500', async (_name, overrides) => {
    const res = await create(overrides);

    expect(res.status).toBe(422);
    expect(await prisma.event.count()).toBe(0);
  });
});

describe('editing an event', () => {
  it('refuses moving registration to close after the event ends', async () => {
    const club = await mkClub();
    const lead = await makeActiveLead(app, club.id);
    const event = await mkEvent(club.id, lead.userId);

    const res = await request(app.getHttpServer())
      .patch(`${API_PREFIX}/events/${event.id}`)
      .set('Cookie', lead.sessionCookie)
      .send({ registrationClosesAt: new Date(event.endsAt.getTime() + DAY).toISOString() });

    expect(res.status).toBe(422);
  });
});

describe('the database', () => {
  it('refuses a registration window that closes before it opens, whatever the code does', async () => {
    const club = await mkClub();
    const lead = await makeActiveLead(app, club.id);

    await expect(
      mkEvent(club.id, lead.userId, {
        registrationOpensAt: new Date(Date.now() + DAY),
        registrationClosesAt: new Date(Date.now() - DAY),
      }),
    ).rejects.toThrow();
  });
});

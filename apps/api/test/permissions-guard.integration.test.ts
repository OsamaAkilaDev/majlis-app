import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resolveClubFacts, resolveEventFacts, PermissionsGuard } from '../src/auth/permissions.guard';
import { API_PREFIX } from '../src/config/api-prefix';
import { TransactionHost } from '../src/prisma/transaction.host';
import { createTestApp } from './app';
import { sessionCookieFor } from './auth-helpers';
import { truncateAll } from './db';
import { aUser, mkAppointment, mkClub, mkEvent, mkUser, testDb } from './factories';
import { ScopedTestModule } from './fixtures/scoped.controller';

const prisma = testDb();
const CLUB_EDIT_PATH = (clubId: string) => `${API_PREFIX}/__test/clubs/${clubId}/edit`;
const USER_STATUS_PATH = (id: string) => `${API_PREFIX}/__test/users/${id}/status`;

let app: INestApplication;
let host: TransactionHost;

beforeAll(async () => {
  app = await createTestApp([ScopedTestModule]);
  host = app.get(TransactionHost);
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await truncateAll(prisma);
});

describe('PermissionsGuard: HTTP', () => {
  it('denies a non-admin and records the denial, and the write does not happen', async () => {
    // Catches a denial that records nothing, and one that records but lets the write through.
    const student = await mkUser(); // platformRole defaults to STUDENT
    const cookie = await sessionCookieFor(student.id);
    const target = await prisma.user.create({ data: aUser() });

    const res = await request(app.getHttpServer())
      .patch(USER_STATUS_PATH(target.id))
      .set('Cookie', cookie)
      .send({ status: 'SUSPENDED' });

    expect(res.status).toBe(403);
    // Pins that a guard's ForbiddenError still reaches ProblemExceptionFilter.
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);

    const rows = await prisma.auditLog.findMany({ where: { entityId: target.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe('permission.denied');
    expect(rows[0]?.outcome).toBe('DENIED');
    expect(rows[0]?.actorUserId).toBe(student.id);

    expect(await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).toMatchObject({
      status: 'ACTIVE',
    });
  });

  it('allows an ADMIN through the same route, and the write happens', async () => {
    // Positive control: a guard that denies everything passes the test above.
    const admin = await mkUser({ platformRole: 'ADMIN' });
    const cookie = await sessionCookieFor(admin.id);
    const target = await prisma.user.create({ data: aUser() });

    const res = await request(app.getHttpServer())
      .patch(USER_STATUS_PATH(target.id))
      .set('Cookie', cookie)
      .send({ status: 'SUSPENDED' });

    expect(res.status).toBe(200);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).toMatchObject({
      status: 'SUSPENDED',
    });
    expect(await prisma.auditLog.count({ where: { entityId: target.id } })).toBe(0);
  });

  it('grants club scope over HTTP to a LEAD in that club, and denies a non-member', async () => {
    const lead = await mkUser();
    const outsider = await mkUser();
    const club = await mkClub();
    await mkAppointment({ userId: lead.id, clubId: club.id, role: 'LEAD', status: 'ACTIVE' });

    const leadRes = await request(app.getHttpServer())
      .get(CLUB_EDIT_PATH(club.id))
      .set('Cookie', await sessionCookieFor(lead.id));
    expect(leadRes.status).toBe(200);

    const outsiderRes = await request(app.getHttpServer())
      .get(CLUB_EDIT_PATH(club.id))
      .set('Cookie', await sessionCookieFor(outsider.id));
    expect(outsiderRes.status).toBe(403);
  });

  it('denies rather than 500s when the scope path in the decorator is unresolvable', async () => {
    // Catches readAt missing its `typeof acc !== 'object'` guard, which 500s.
    const user = await mkUser(); // STUDENT, no club roles: evaluate() must deny
    const club = await mkClub();
    const res = await request(app.getHttpServer())
      .get(`${API_PREFIX}/__test/clubs/${club.id}/broken-scope`)
      .set('Cookie', await sessionCookieFor(user.id));
    expect(res.status).toBe(403);
  });
});

describe('resolveClubFacts', () => {
  it('grants club scope only in the club the appointment is in', async () => {
    // Two users and two clubs, so a resolver ignoring userId fails.
    const alice = await mkUser();
    const bob = await mkUser();
    const clubA = await mkClub();
    const clubB = await mkClub();
    await mkAppointment({ userId: alice.id, clubId: clubA.id, role: 'LEAD', status: 'ACTIVE' });

    expect(await resolveClubFacts(host, alice.id, clubA.id)).toMatchObject({ clubRoles: ['LEAD'] });
    expect(await resolveClubFacts(host, alice.id, clubB.id)).toMatchObject({ clubRoles: [] });
    expect(await resolveClubFacts(host, bob.id, clubA.id)).toMatchObject({ clubRoles: [] });
  });

  it('ignores an appointment that is not ACTIVE', async () => {
    // Catches a resolver ignoring status, granting authority to INVITED or DECLINED.
    const alice = await mkUser();
    const clubA = await mkClub();
    for (const status of ['INVITED', 'DECLINED', 'EXPIRED', 'ENDED'] as const) {
      await prisma.clubTeamAppointment.deleteMany({});
      await mkAppointment({ userId: alice.id, clubId: clubA.id, role: 'LEAD', status });
      expect(await resolveClubFacts(host, alice.id, clubA.id), status).toMatchObject({ clubRoles: [] });
    }
  });
});

describe('resolveEventFacts', () => {
  it('grants event scope only for the event the assignment is on', async () => {
    // Two users and two events: catches a resolver ignoring userId or eventId.
    const alice = await mkUser();
    const bob = await mkUser();
    const club = await mkClub();
    const eventA = await mkEvent(club.id, alice.id);
    const eventB = await mkEvent(club.id, alice.id);
    await prisma.eventAssignment.create({
      data: { eventId: eventA.id, userId: alice.id, responsibility: 'EVENT_LEAD', assignedById: alice.id },
    });

    expect(await resolveEventFacts(host, alice.id, eventA.id)).toMatchObject({
      eventResponsibilities: ['EVENT_LEAD'],
    });
    expect(await resolveEventFacts(host, alice.id, eventB.id)).toMatchObject({
      eventResponsibilities: [],
    });
    expect(await resolveEventFacts(host, bob.id, eventA.id)).toMatchObject({
      eventResponsibilities: [],
    });
  });
});

describe('PermissionsGuard.loadFacts: event scope also carries the event\'s club authority', () => {
  it('grants a club LEAD authority over an event in their own club with no per-event assignment', async () => {
    // Catches a resolver querying only EventAssignment, denying a Lead on their own club's event.
    const lead = await mkUser();
    const club = await mkClub();
    const event = await mkEvent(club.id, lead.id);
    await mkAppointment({ userId: lead.id, clubId: club.id, role: 'LEAD', status: 'ACTIVE' });

    const guard = app.get(PermissionsGuard);
    const facts = await guard.loadFacts(lead, { scope: 'event', from: 'params.eventId' }, event.id);

    expect(facts.clubRoles).toEqual(['LEAD']);
    expect(facts.eventResponsibilities).toEqual([]);
  });

  it('resolves to no authority, not a throw, for an event id that does not exist', async () => {
    const user = await mkUser();
    const guard = app.get(PermissionsGuard);

    await expect(
      guard.loadFacts(user, { scope: 'event', from: 'params.eventId' }, '00000000-0000-7000-8000-000000000000'),
    ).resolves.toMatchObject({ clubRoles: [], eventResponsibilities: [] });
  });
});

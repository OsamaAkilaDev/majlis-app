import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { API_PREFIX } from '../src/config/api-prefix';
import { createTestApp } from './app';
import { loginAsAdmin, loginAsStudent } from './auth-helpers';
import { truncateAll } from './db';
import {
  DAY,
  HOUR,
  makeActiveLead,
  makeActiveOfficer,
  mkClub,
  mkEvent,
  mkRegistration,
  testDb,
} from './factories';

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

function patch(cookie: string, eventId: string, body: object) {
  return request(app.getHttpServer())
    .patch(`${API_PREFIX}/events/${eventId}`)
    .set('Cookie', cookie)
    .send(body);
}

function publish(cookie: string, eventId: string) {
  return request(app.getHttpServer())
    .post(`${API_PREFIX}/events/${eventId}/publish`)
    .set('Cookie', cookie);
}

function detail(cookie: string, eventId: string) {
  return request(app.getHttpServer()).get(`${API_PREFIX}/events/${eventId}`).set('Cookie', cookie);
}

const CLOSED_WINDOW = {
  registrationOpensAt: new Date(Date.now() - 2 * DAY),
  registrationClosesAt: new Date(Date.now() - HOUR),
  startsAt: new Date(Date.now() + DAY),
  endsAt: new Date(Date.now() + DAY + 2 * HOUR),
};

describe('POST /clubs/:clubId/events', () => {
  it('creates a draft, with a slug derived from the title and scoped to the club', async () => {
    const club = await mkClub();
    const lead = await makeActiveLead(app, club.id);

    const res = await request(app.getHttpServer())
      .post(`${API_PREFIX}/clubs/${club.id}/events`)
      .set('Cookie', lead.sessionCookie)
      .send({
        eventId: crypto.randomUUID(),
        title: 'Robot Night',
        summary: 'Robots.',
        description: 'A night of robots.',
        eventType: 'Workshop',
        audience: 'All students',
        startsAt: at(7 * DAY),
        endsAt: at(7 * DAY + 2 * HOUR),
        registrationOpensAt: at(-DAY),
        registrationClosesAt: at(6 * DAY),
        capacity: 20,
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('DRAFT');
    expect(res.body.slug).toBe('robot-night');
  });
});

describe('PATCH /events/:eventId, field-level permissions', () => {
  it('lets a club Marketing officer edit the title and refuses them the start time', async () => {
    // Catches a guard reading only EventAssignment, and a missing field gate letting Marketing move timestamps.
    const club = await mkClub();
    const lead = await makeActiveLead(app, club.id);
    const marketing = await makeActiveOfficer(app, club.id, 'MARKETING');
    const event = await mkEvent(club.id, lead.userId);

    const allowed = await patch(marketing.sessionCookie, event.id, { title: 'Renamed Night' });
    expect(allowed.status).toBe(200);
    expect(allowed.body.title).toBe('Renamed Night');

    const refused = await patch(marketing.sessionCookie, event.id, { startsAt: at(30 * DAY) });
    expect(refused.status).toBe(403);
    // The detail, since a route refusing Marketing outright passes on status alone.
    expect(refused.body.detail).toBe('You do not have permission to change startsAt.');
    expect((await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).startsAt).toEqual(
      event.startsAt,
    );
  });

  it('refuses lowering capacity below the confirmed count', async () => {
    // The service must refuse with its own message before event_capacity_bounds fires.
    const club = await mkClub();
    const lead = await makeActiveLead(app, club.id);
    const event = await mkEvent(club.id, lead.userId, { capacity: 10, confirmedCount: 4 });

    const res = await patch(lead.sessionCookie, event.id, { capacity: 3 });
    expect(res.status).toBe(422);
    expect(res.body.detail).toBe('Capacity cannot be lower than the 4 students already confirmed.');
    expect((await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).capacity).toBe(10);
  });
});

describe('event lifecycle transitions that must be refused', () => {
  it('refuses publishing from a suspended club and publishing a cancelled event', async () => {
    const suspended = await mkClub({ status: 'SUSPENDED' });
    const suspendedLead = await makeActiveLead(app, suspended.id);
    const draft = await mkEvent(suspended.id, suspendedLead.userId, { status: 'DRAFT' });

    const fromSuspended = await publish(suspendedLead.sessionCookie, draft.id);
    expect(fromSuspended.status).toBe(422);
    expect(fromSuspended.body.detail).toBe('That club is not accepting new activity.');
    expect((await prisma.event.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe('DRAFT');

    const club = await mkClub();
    const lead = await makeActiveLead(app, club.id);
    const cancelled = await mkEvent(club.id, lead.userId, { status: 'CANCELLED' });

    const fromCancelled = await publish(lead.sessionCookie, cancelled.id);
    expect(fromCancelled.status).toBe(422);
    expect(fromCancelled.body.detail).toBe('That event was cancelled.');
  });

  it('refuses cancelling an event that has already issued certificates', async () => {
    const club = await mkClub();
    const lead = await makeActiveLead(app, club.id);
    const certified = await mkEvent(club.id, lead.userId, { status: 'CERTIFIED' });

    const res = await request(app.getHttpServer())
      .post(`${API_PREFIX}/events/${certified.id}/cancel`)
      .set('Cookie', lead.sessionCookie)
      .send({ reason: 'Changed our minds.' });

    expect(res.status).toBe(422);
    expect(res.body.detail).toBe('That event has issued certificates and is final.');
    expect((await prisma.event.findUniqueOrThrow({ where: { id: certified.id } })).status).toBe('CERTIFIED');
  });
});

describe('publish and cancel under a concurrent status write', () => {
  // Holds the other writer's change uncommitted. Do not return inFlight from the callback:
  // Prisma awaits the return value before committing, and the request waits on that commit.
  async function racing(eventId: string, status: string, send: () => Promise<request.Response>) {
    let inFlight!: Promise<request.Response>;
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`UPDATE "event" SET "status" = ${status}::event_status WHERE "id" = ${eventId}::uuid`;
      inFlight = send().then((r) => r);
      // Until the request finishes or has had ample time to reach its wait.
      await Promise.race([inFlight, new Promise((resolve) => setTimeout(resolve, 3000))]);
    });
    return inFlight;
  }

  it('refuses a cancel that read COMPLETED while certificates were issuing', async () => {
    // Catches an unconditional write: CANCELLED lands over CERTIFIED.
    const club = await mkClub();
    const lead = await makeActiveLead(app, club.id);
    const event = await mkEvent(club.id, lead.userId, { status: 'COMPLETED' });

    const res = await racing(event.id, 'CERTIFIED', () =>
      request(app.getHttpServer())
        .post(`${API_PREFIX}/events/${event.id}/cancel`)
        .set('Cookie', lead.sessionCookie)
        .send({ reason: 'Changed our minds.' }),
    );

    expect(res.status).toBe(409);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).status).toBe('CERTIFIED');
    expect(await prisma.auditLog.count({ where: { entityId: event.id, action: 'event.cancelled' } })).toBe(0);
  });

  it('refuses a publish that read DRAFT while the event was being cancelled', async () => {
    const club = await mkClub();
    const lead = await makeActiveLead(app, club.id);
    const event = await mkEvent(club.id, lead.userId, { status: 'DRAFT' });

    const res = await racing(event.id, 'CANCELLED', () => publish(lead.sessionCookie, event.id));

    expect(res.status).toBe(409);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).status).toBe('CANCELLED');
  });
});

describe('lazy lifecycle', () => {
  it('advances on a single read and then does nothing on the next one', async () => {
    const club = await mkClub();
    const lead = await makeActiveLead(app, club.id);
    const event = await mkEvent(club.id, lead.userId, { status: 'PUBLISHED', ...CLOSED_WINDOW });
    const student = await loginAsStudent(app);

    const first = await detail(student.sessionCookie, event.id);
    expect(first.status).toBe(200);
    expect(first.body.status).toBe('REGISTRATION_CLOSED');

    const hops = () =>
      prisma.auditLog.count({ where: { entityId: event.id, action: 'event.status_advanced' } });
    expect(await hops()).toBe(1);

    // Catches a non-idempotent advance, which writes an audit row per page view.
    expect((await detail(student.sessionCookie, event.id)).body.status).toBe('REGISTRATION_CLOSED');
    expect(await hops()).toBe(1);
  });

  it('never advances a draft or a cancelled event, whatever the clock says', async () => {
    const club = await mkClub();
    const lead = await makeActiveLead(app, club.id);
    const draft = await mkEvent(club.id, lead.userId, { status: 'DRAFT', ...CLOSED_WINDOW });
    const cancelled = await mkEvent(club.id, lead.userId, { status: 'CANCELLED', ...CLOSED_WINDOW });

    expect((await detail(lead.sessionCookie, draft.id)).body.status).toBe('DRAFT');
    expect((await detail(lead.sessionCookie, cancelled.id)).body.status).toBe('CANCELLED');
  });
});

describe('draft visibility', () => {
  it('hides a draft from a student and shows it to the club team', async () => {
    const club = await mkClub();
    const lead = await makeActiveLead(app, club.id);
    const draft = await mkEvent(club.id, lead.userId, { status: 'DRAFT' });
    const student = await loginAsStudent(app);

    // 404 rather than 403: telling a student the draft exists is the leak.
    expect((await detail(student.sessionCookie, draft.id)).status).toBe(404);
    const list = await request(app.getHttpServer())
      .get(`${API_PREFIX}/events`)
      .set('Cookie', student.sessionCookie);
    expect(list.body.items).toHaveLength(0);

    expect((await detail(lead.sessionCookie, draft.id)).status).toBe(200);
    const admin = await loginAsAdmin(app);
    expect((await detail(admin.sessionCookie, draft.id)).status).toBe(200);
  });
});

describe('DELETE /events/:eventId/assignments/:assignmentId', () => {
  it("refuses an assignment id that belongs to another club's event", async () => {
    // Catches a handler loading by id alone, deleting a row on another event.
    const clubA = await mkClub();
    const clubB = await mkClub();
    const leadA = await makeActiveLead(app, clubA.id);
    const leadB = await makeActiveLead(app, clubB.id);
    const eventA = await mkEvent(clubA.id, leadA.userId);
    const eventB = await mkEvent(clubB.id, leadB.userId);

    const onB = await request(app.getHttpServer())
      .post(`${API_PREFIX}/events/${eventB.id}/assignments`)
      .set('Cookie', leadB.sessionCookie)
      .send({ userId: leadB.userId, responsibility: 'OPERATIONS' });
    expect(onB.status).toBe(201);

    const res = await request(app.getHttpServer())
      .delete(`${API_PREFIX}/events/${eventA.id}/assignments/${onB.body.id}`)
      .set('Cookie', leadA.sessionCookie);

    expect(res.status).toBe(404);
    expect(res.body.detail).toBe('No such assignment.');
    expect(await prisma.eventAssignment.count({ where: { id: onB.body.id } })).toBe(1);
  });
});

describe('field permissions on the poster upload route', () => {
  // event:edit admits all five roles but posterUploaded is Marketing-only.
  it.each(['CTO', 'OPERATIONS'] as const)('refuses %s a poster upload URL', async (role) => {
    const club = await mkClub();
    const lead = await makeActiveLead(app, club.id);
    const event = await mkEvent(club.id, lead.userId);
    const officer = await makeActiveOfficer(app, club.id, role);

    const res = await request(app.getHttpServer())
      .post(`${API_PREFIX}/events/${event.id}/poster-upload-url`)
      .set('Cookie', officer.sessionCookie);

    expect(res.status).toBe(403);
    expect(res.body.detail).toBe('You do not have permission to change posterUploaded.');
  });

  it('still lets Marketing mint one', async () => {
    const club = await mkClub();
    const lead = await makeActiveLead(app, club.id);
    const event = await mkEvent(club.id, lead.userId);
    const marketing = await makeActiveOfficer(app, club.id, 'MARKETING');

    const res = await request(app.getHttpServer())
      .post(`${API_PREFIX}/events/${event.id}/poster-upload-url`)
      .set('Cookie', marketing.sessionCookie);

    expect(res.status).toBe(201);
  });

  // The mint overwrites the live public poster, so it takes PATCH's status gate.
  it('refuses a cancelled event and records the mint it allows', async () => {
    const club = await mkClub();
    const lead = await makeActiveLead(app, club.id);
    const cancelled = await mkEvent(club.id, lead.userId, { status: 'CANCELLED' });

    const refused = await request(app.getHttpServer())
      .post(`${API_PREFIX}/events/${cancelled.id}/poster-upload-url`)
      .set('Cookie', lead.sessionCookie);

    expect(refused.status).toBe(422);
    expect(refused.body.detail).toBe('A cancelled event can no longer be edited.');

    const live = await mkEvent(club.id, lead.userId);
    const allowed = await request(app.getHttpServer())
      .post(`${API_PREFIX}/events/${live.id}/poster-upload-url`)
      .set('Cookie', lead.sessionCookie);

    expect(allowed.status).toBe(201);
    // The bytes bypass the API, so this row is the only record of the replacement.
    const rows = await prisma.auditLog.findMany({
      where: { entityId: live.id, action: 'event.upload_url_minted' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.actorUserId).toBe(lead.userId);
    // Nothing is recorded for the refusal: that transaction rolled back.
    expect(
      await prisma.auditLog.count({ where: { entityId: cancelled.id, action: 'event.upload_url_minted' } }),
    ).toBe(0);
  });
});

describe('admin override reason', () => {
  // Catches an admin edit writing event.updated with reason null.
  it('refuses an admin edit with no reason, and records it when given', async () => {
    const club = await mkClub();
    const lead = await makeActiveLead(app, club.id);
    const event = await mkEvent(club.id, lead.userId);
    const admin = await loginAsAdmin(app);

    const bare = await request(app.getHttpServer())
      .patch(`${API_PREFIX}/events/${event.id}`)
      .set('Cookie', admin.sessionCookie)
      .send({ title: 'Renamed by admin' });

    expect(bare.status).toBe(422);
    expect(bare.body.detail).toBe('An admin override requires a reason.');

    const withReason = await request(app.getHttpServer())
      .patch(`${API_PREFIX}/events/${event.id}`)
      .set('Cookie', admin.sessionCookie)
      .send({ title: 'Renamed by admin', overrideReason: 'Reported title breached policy.' });

    expect(withReason.status).toBe(200);
    const row = await prisma.auditLog.findFirst({
      where: { action: 'event.updated', entityId: event.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(row?.reason).toBe('Reported title breached policy.');
  });

  it('does not ask a club Lead for one', async () => {
    const club = await mkClub();
    const lead = await makeActiveLead(app, club.id);
    const event = await mkEvent(club.id, lead.userId);

    const res = await request(app.getHttpServer())
      .patch(`${API_PREFIX}/events/${event.id}`)
      .set('Cookie', lead.sessionCookie)
      .send({ title: 'Renamed by the lead' });

    expect(res.status).toBe(200);
  });
});

describe('admin override reason on create, publish, assign and unassign', () => {
  // All four are admin overrides; catches a reason gate on the patch path only.
  const NEW_EVENT = () => ({
    eventId: crypto.randomUUID(),
    title: 'Admin Night',
    summary: 'Run by the university.',
    description: 'Something happens.',
    eventType: 'Workshop',
    audience: 'All students',
    startsAt: at(7 * DAY),
    endsAt: at(7 * DAY + 2 * HOUR),
    registrationOpensAt: at(-DAY),
    registrationClosesAt: at(6 * DAY),
    capacity: 20,
  });

  const reasonOf = (action: string, entityId: string) =>
    prisma.auditLog
      .findFirst({ where: { action, entityId }, orderBy: { createdAt: 'desc' } })
      .then((row) => row?.reason ?? null);

  it('refuses each one bare and records the reason when given', async () => {
    const club = await mkClub();
    const lead = await makeActiveLead(app, club.id);
    const admin = await loginAsAdmin(app);

    const create = (body: object) =>
      request(app.getHttpServer())
        .post(`${API_PREFIX}/clubs/${club.id}/events`)
        .set('Cookie', admin.sessionCookie)
        .send(body);

    const bareCreate = await create(NEW_EVENT());
    expect(bareCreate.status).toBe(422);
    expect(bareCreate.body.detail).toBe('An admin override requires a reason.');
    // The refusal is thrown inside the transaction, so nothing is left behind.
    expect(await prisma.event.count()).toBe(0);

    const created = await create({ ...NEW_EVENT(), overrideReason: 'Faculty-run event.' });
    expect(created.status).toBe(201);
    expect(await reasonOf('event.created', created.body.id)).toBe('Faculty-run event.');
    const eventId = created.body.id as string;

    const barePublish = await publish(admin.sessionCookie, eventId);
    expect(barePublish.status).toBe(422);
    expect(barePublish.body.detail).toBe('An admin override requires a reason.');
    expect((await prisma.event.findUniqueOrThrow({ where: { id: eventId } })).status).toBe('DRAFT');

    const published = await request(app.getHttpServer())
      .post(`${API_PREFIX}/events/${eventId}/publish`)
      .set('Cookie', admin.sessionCookie)
      .send({ overrideReason: 'Dean asked for it to go live.' });
    expect(published.status).toBe(201);
    expect(await reasonOf('event.published', eventId)).toBe('Dean asked for it to go live.');

    const assign = (body: object) =>
      request(app.getHttpServer())
        .post(`${API_PREFIX}/events/${eventId}/assignments`)
        .set('Cookie', admin.sessionCookie)
        .send(body);

    const bareAssign = await assign({ userId: lead.userId, responsibility: 'OPERATIONS' });
    expect(bareAssign.status).toBe(422);
    expect(bareAssign.body.detail).toBe('An admin override requires a reason.');
    expect(await prisma.eventAssignment.count()).toBe(0);

    const assigned = await assign({
      userId: lead.userId,
      responsibility: 'OPERATIONS',
      overrideReason: 'Nobody in the club could check people in.',
    });
    expect(assigned.status).toBe(201);
    expect(await reasonOf('event.responsibility_assigned', assigned.body.id)).toBe(
      'Nobody in the club could check people in.',
    );

    const unassign = (body: object) =>
      request(app.getHttpServer())
        .delete(`${API_PREFIX}/events/${eventId}/assignments/${assigned.body.id}`)
        .set('Cookie', admin.sessionCookie)
        .send(body);

    const bareRemove = await unassign({});
    expect(bareRemove.status).toBe(422);
    expect(bareRemove.body.detail).toBe('An admin override requires a reason.');
    expect(await prisma.eventAssignment.count()).toBe(1);

    const removed = await unassign({ overrideReason: 'Assigned in error.' });
    expect(removed.status).toBe(204);
    expect(await reasonOf('event.responsibility_removed', assigned.body.id)).toBe('Assigned in error.');
  });

  it('asks a club Lead for none of it', async () => {
    // Catches a gate demanding a reason from everyone, including the club's own team.
    const club = await mkClub();
    const lead = await makeActiveLead(app, club.id);

    const created = await request(app.getHttpServer())
      .post(`${API_PREFIX}/clubs/${club.id}/events`)
      .set('Cookie', lead.sessionCookie)
      .send(NEW_EVENT());
    expect(created.status).toBe(201);
    expect(await reasonOf('event.created', created.body.id)).toBeNull();

    expect((await publish(lead.sessionCookie, created.body.id)).status).toBe(201);

    const assigned = await request(app.getHttpServer())
      .post(`${API_PREFIX}/events/${created.body.id}/assignments`)
      .set('Cookie', lead.sessionCookie)
      .send({ userId: lead.userId, responsibility: 'OPERATIONS' });
    expect(assigned.status).toBe(201);

    const removed = await request(app.getHttpServer())
      .delete(`${API_PREFIX}/events/${created.body.id}/assignments/${assigned.body.id}`)
      .set('Cookie', lead.sessionCookie)
      .send({});
    expect(removed.status).toBe(204);
  });
});

describe('GET /events renders the due status without writing it', () => {
  it('reports a closed registration window that nobody has opened yet', async () => {
    // Catches a list reading row.status straight through while the detail says closed.
    const club = await mkClub();
    const lead = await makeActiveLead(app, club.id);
    const event = await mkEvent(club.id, lead.userId, { status: 'PUBLISHED', ...CLOSED_WINDOW });
    const student = await loginAsStudent(app);

    const list = await request(app.getHttpServer())
      .get(`${API_PREFIX}/events`)
      .set('Cookie', student.sessionCookie);

    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].status).toBe('REGISTRATION_CLOSED');
    // Name and slug differ by construction, so swapping the two fields fails here.
    expect(list.body.items[0].clubSlug).toBe(club.slug);
    expect(list.body.items[0].clubSlug).not.toBe(club.name);

    // A list read must not write.
    expect((await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).status).toBe('PUBLISHED');
    expect(
      await prisma.auditLog.count({ where: { entityId: event.id, action: 'event.status_advanced' } }),
    ).toBe(0);
  });
});

describe('advance under a concurrent transition', () => {
  it('does not replay the walk when another writer got there first', async () => {
    // Catches an unconditional hop update filing a second history for one transition.
    const club = await mkClub();
    const lead = await makeActiveLead(app, club.id);
    const event = await mkEvent(club.id, lead.userId, { status: 'PUBLISHED', ...CLOSED_WINDOW });
    const student = await loginAsStudent(app);

    // The outside row lock widens an otherwise unreproducible race. Do not return inFlight from the
    // callback: Prisma awaits the return value before committing, and the request waits on that commit.
    let inFlight!: Promise<request.Response>;
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "event" WHERE "id" = ${event.id}::uuid FOR UPDATE`;
      inFlight = detail(student.sessionCookie, event.id).then((r) => r);
      await new Promise((resolve) => setTimeout(resolve, 300));
      await tx.$executeRaw`UPDATE "event" SET "status" = 'REGISTRATION_CLOSED' WHERE "id" = ${event.id}::uuid`;
    });
    const read = await inFlight;

    expect(read.status).toBe(200);
    expect(read.body.status).toBe('REGISTRATION_CLOSED');
    expect((await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).status).toBe(
      'REGISTRATION_CLOSED',
    );
    // The other writer made the transition, so the request records none itself.
    expect(
      await prisma.auditLog.count({ where: { entityId: event.id, action: 'event.status_advanced' } }),
    ).toBe(0);
  });
});

describe('reopening a registration window', () => {
  it('refuses to move the close time forward once registration has closed', async () => {
    // advanceRow walks forward only, so a 200 would save a date the lifecycle never honours.
    const club = await mkClub();
    const lead = await makeActiveLead(app, club.id);
    const event = await mkEvent(club.id, lead.userId, { status: 'REGISTRATION_CLOSED', ...CLOSED_WINDOW });

    const res = await patch(lead.sessionCookie, event.id, { registrationClosesAt: at(DAY + HOUR) });

    expect(res.status).toBe(422);
    expect(res.body.detail).toBe('Registration cannot be reopened once it has closed.');
    expect(
      (await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).registrationClosesAt,
    ).toEqual(event.registrationClosesAt);
  });

  it('still lets a PUBLISHED event move its close time', async () => {
    // Catches a blanket refusal of registrationClosesAt on every live event.
    const club = await mkClub();
    const lead = await makeActiveLead(app, club.id);
    const event = await mkEvent(club.id, lead.userId, { status: 'PUBLISHED' });

    const res = await patch(lead.sessionCookie, event.id, { registrationClosesAt: at(5 * DAY) });
    expect(res.status).toBe(200);
  });
});

describe('draft visibility for an event assignee', () => {
  it('shows a draft to someone assigned to it who holds no club role', async () => {
    // The third branch of the list filter and detail gate; the officer and Admin cases pass without it.
    const club = await mkClub();
    const lead = await makeActiveLead(app, club.id);
    const draft = await mkEvent(club.id, lead.userId, { status: 'DRAFT' });
    const helper = await loginAsStudent(app);

    const assigned = await request(app.getHttpServer())
      .post(`${API_PREFIX}/events/${draft.id}/assignments`)
      .set('Cookie', lead.sessionCookie)
      .send({ userId: helper.userId, responsibility: 'OPERATIONS' });
    expect(assigned.status).toBe(201);

    expect((await detail(helper.sessionCookie, draft.id)).status).toBe(200);
    const list = await request(app.getHttpServer())
      .get(`${API_PREFIX}/events`)
      .set('Cookie', helper.sessionCookie);
    expect(list.body.items.map((e: { id: string }) => e.id)).toEqual([draft.id]);
  });
});

describe('a certificate cannot be enabled with nothing behind it', () => {
  it('refuses to enable certificates on an event that has no certificate fields', async () => {
    // Valid alone, invalid only merged with the stored row, so a contract-only rule lets it through.
    const club = await mkClub();
    const lead = await makeActiveLead(app, club.id);
    const event = await mkEvent(club.id, lead.userId, {
      certificateEnabled: false,
      certificateTitle: null,
      certificateSignatory: null,
    });

    const refused = await patch(lead.sessionCookie, event.id, { certificateEnabled: true });
    expect(refused.status).toBe(422);
    expect(refused.body.detail).toContain('certificate');

    const accepted = await patch(lead.sessionCookie, event.id, {
      certificateEnabled: true,
      certificateTitle: 'Certificate of Attendance',
      certificateSignatory: 'Head of Engineering',
    });
    expect(accepted.status).toBe(200);
  });

  it('lets a patch flip the toggle when the stored row already carries both fields', async () => {
    // A rule reading the patch alone rejects this, blocking re-enabling certificates.
    const club = await mkClub();
    const lead = await makeActiveLead(app, club.id);
    const event = await mkEvent(club.id, lead.userId, {
      certificateEnabled: false,
      certificateTitle: 'Certificate of Attendance',
      certificateSignatory: 'Head of Engineering',
    });

    const res = await patch(lead.sessionCookie, event.id, { certificateEnabled: true });
    expect(res.status).toBe(200);
  });
});

describe('GET /events?fromMyClubs=true', () => {
  function fromMyClubs(cookie: string) {
    return request(app.getHttpServer())
      .get(`${API_PREFIX}/events?fromMyClubs=true`)
      .set('Cookie', cookie);
  }

  it("returns only the caller's own clubs", async () => {
    // Two users and two clubs, so ignoring the flag fails.
    const clubA = await mkClub();
    const clubB = await mkClub();
    const leadA = await makeActiveLead(app, clubA.id);
    const leadB = await makeActiveLead(app, clubB.id);
    const userA = await loginAsStudent(app);
    const userB = await loginAsStudent(app);
    await prisma.clubMembership.create({
      data: { clubId: clubA.id, userId: userA.userId, status: 'ACTIVE' },
    });
    await prisma.clubMembership.create({
      data: { clubId: clubB.id, userId: userB.userId, status: 'ACTIVE' },
    });
    const eventA = await mkEvent(clubA.id, leadA.userId);
    const eventB = await mkEvent(clubB.id, leadB.userId);

    const asA = await fromMyClubs(userA.sessionCookie);
    expect(asA.status).toBe(200);
    expect(asA.body.items.map((e: { id: string }) => e.id)).toEqual([eventA.id]);

    const asB = await fromMyClubs(userB.sessionCookie);
    expect(asB.body.items.map((e: { id: string }) => e.id)).toEqual([eventB.id]);
  });

  it('excludes an event the caller is WAITLISTED for', async () => {
    // WAITLISTED, not CONFIRMED, proves the exclusion checks any held place.
    const club = await mkClub();
    const lead = await makeActiveLead(app, club.id);
    const user = await loginAsStudent(app);
    await prisma.clubMembership.create({
      data: { clubId: club.id, userId: user.userId, status: 'ACTIVE' },
    });
    const notHeld = await mkEvent(club.id, lead.userId);
    const held = await mkEvent(club.id, lead.userId);
    await mkRegistration(held.id, user.userId, 'WAITLISTED');

    const res = await fromMyClubs(user.sessionCookie);
    expect(res.body.items.map((e: { id: string }) => e.id)).toEqual([notHeld.id]);
  });

  it('returns nothing for a caller in no clubs', async () => {
    // Catches skipping the club filter on an empty membership list, returning every event.
    const club = await mkClub();
    const lead = await makeActiveLead(app, club.id);
    await mkEvent(club.id, lead.userId);
    const user = await loginAsStudent(app);

    const res = await fromMyClubs(user.sessionCookie);
    expect(res.body.items).toEqual([]);
  });
});

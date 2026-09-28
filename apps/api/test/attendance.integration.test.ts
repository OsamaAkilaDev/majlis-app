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

function manual(cookie: string, eventId: string, body: object) {
  return request(app.getHttpServer())
    .post(`${API_PREFIX}/events/${eventId}/check-in/manual`)
    .set('Cookie', cookie)
    .send(body);
}

function roster(cookie: string, eventId: string) {
  return request(app.getHttpServer())
    .get(`${API_PREFIX}/events/${eventId}/attendance`)
    .set('Cookie', cookie);
}

function correct(cookie: string, eventId: string, registrationId: string, body: object) {
  return request(app.getHttpServer())
    .patch(`${API_PREFIX}/events/${eventId}/attendance/${registrationId}`)
    .set('Cookie', cookie)
    .send(body);
}

async function emailOf(userId: string): Promise<string> {
  return (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).email;
}

async function checkIn(cookie: string, eventId: string, userId: string) {
  return manual(cookie, eventId, { email: await emailOf(userId), reason: 'At the door' });
}

async function anOngoingEvent(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  const club = await mkClub();
  const lead = await makeActiveLead(app, club.id);
  const ops = await makeActiveOfficer(app, club.id, 'OPERATIONS');
  const event = await mkEvent(club.id, lead.userId, {
    status: 'ONGOING',
    startsAt: new Date(now - HOUR),
    endsAt: new Date(now + HOUR),
    registrationOpensAt: new Date(now - DAY),
    registrationClosesAt: new Date(now - HOUR),
    capacity: 30,
    confirmedCount: 1,
    ...overrides,
  });
  const student = await loginAsStudent(app);
  const registration = await mkRegistration(event.id, student.userId, 'CONFIRMED');
  return { club, lead, ops, event, student, registration };
}

describe('POST /events/:eventId/check-in/manual', () => {
  it('checks a confirmed student in, once, with their name for the operator to eyeball', async () => {
    const { lead, event, student, registration } = await anOngoingEvent();

    const res = await checkIn(lead.sessionCookie, event.id, student.userId);

    expect(res.status).toBe(200);
    expect(res.body.result).toBe('CHECKED_IN');
    expect(res.body.email).toMatch(/@uni\.ac\.ae$/);
    expect(res.body.fullName).toBe('Test Person');

    const record = await prisma.attendanceRecord.findUniqueOrThrow({
      where: { registrationId: registration.id },
    });
    expect(record.method).toBe('MANUAL');
    expect(record.checkedInById).toBe(lead.userId);

    const after = await prisma.eventRegistration.findUniqueOrThrow({ where: { id: registration.id } });
    expect(after.status).toBe('CHECKED_IN');

    const audit = await prisma.auditLog.findMany({ where: { action: 'attendance.manual_check_in' } });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.actorUserId).toBe(lead.userId);
  });

  it('answers a second check-in with the ORIGINAL time and writes no second record', async () => {
    const { lead, event, student, registration } = await anOngoingEvent();

    const first = await checkIn(lead.sessionCookie, event.id, student.userId);
    const second = await checkIn(lead.sessionCookie, event.id, student.userId);

    expect(second.body.result).toBe('ALREADY_CHECKED_IN');
    // Catches a rewritten timestamp.
    expect(second.body.checkedInAt).toBe(first.body.checkedInAt);
    expect(await prisma.attendanceRecord.count({ where: { registrationId: registration.id } })).toBe(1);
  });

  it('admits one record when two operators check the same person in at the same instant', async () => {
    // Promise.all is not reliably concurrent here, so the first operator is a held transaction.
    // Do not return inFlight from the callback: Prisma awaits it before committing.
    const { lead, ops, event, student, registration } = await anOngoingEvent();
    const email = await emailOf(student.userId);

    let inFlight!: Promise<request.Response>;
    await prisma.$transaction(async (tx) => {
      await tx.attendanceRecord.create({
        data: {
          registrationId: registration.id,
          eventId: event.id,
          userId: student.userId,
          checkedInById: ops.userId,
          method: 'MANUAL',
        },
      });
      inFlight = manual(lead.sessionCookie, event.id, { email, reason: 'At the door' }).then((r) => r);
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    const res = await inFlight;

    // Without attendance_record_registration_id_key this is CHECKED_IN with two rows.
    expect(res.status).toBe(200);
    expect(res.body.result).toBe('ALREADY_CHECKED_IN');
    expect(await prisma.attendanceRecord.count({ where: { registrationId: registration.id } })).toBe(1);
  });

  it('names nobody when the holder is not registered for this event', async () => {
    // A failure must reveal nothing about an unrelated student.
    const { lead, event } = await anOngoingEvent();
    const stranger = await loginAsStudent(app);

    const res = await checkIn(lead.sessionCookie, event.id, stranger.userId);

    expect(res.body).toEqual({ result: 'NOT_REGISTERED' });
  });

  it('distinguishes a cancelled registration from never having registered', async () => {
    const { lead, event } = await anOngoingEvent();
    const quitter = await loginAsStudent(app);
    await mkRegistration(event.id, quitter.userId, 'CANCELLED');

    expect((await checkIn(lead.sessionCookie, event.id, quitter.userId)).body).toEqual({
      result: 'REGISTRATION_CANCELLED',
    });
  });

  it('refuses to check anyone in before the event has started', async () => {
    const now = Date.now();
    const { lead, event, student } = await anOngoingEvent({
      status: 'PUBLISHED',
      startsAt: new Date(now + 2 * DAY),
      endsAt: new Date(now + 2 * DAY + 2 * HOUR),
      registrationClosesAt: new Date(now + DAY),
    });

    const res = await checkIn(lead.sessionCookie, event.id, student.userId);

    expect(res.body.result).toBe('EVENT_NOT_OPEN');
    expect(res.body.eventStatus).toBe('PUBLISHED');
    expect(await prisma.attendanceRecord.count({ where: { eventId: event.id } })).toBe(0);
  });

  it('records the check-in with its method and its reason', async () => {
    const { lead, event, student, registration } = await anOngoingEvent();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: student.userId } });

    const res = await manual(lead.sessionCookie, event.id, {
      email: user.email.toUpperCase(),
      reason: 'Phone battery died at the door',
    });

    expect(res.body.result).toBe('CHECKED_IN');
    const record = await prisma.attendanceRecord.findUniqueOrThrow({
      where: { registrationId: registration.id },
    });
    expect(record.method).toBe('MANUAL');
    expect(record.manualReason).toBe('Phone battery died at the door');

    const audit = await prisma.auditLog.findMany({ where: { action: 'attendance.manual_check_in' } });
    expect(audit[0]?.reason).toBe('Phone battery died at the door');
  });

  it('answers an address with no account exactly like one with no registration', async () => {
    // Divergent answers would make check-in an account-existence oracle.
    const { lead, event } = await anOngoingEvent();

    const res = await manual(lead.sessionCookie, event.id, {
      email: 'nobody-at-all@uni.ac.ae',
      reason: 'Late arrival',
    });

    expect(res.body).toEqual({ result: 'NOT_REGISTERED' });
  });

  it('gives a closed event the same answer whether or not the address has an account', async () => {
    // Catches resolving the address before checking the window, which diverges on a closed event.
    const now = Date.now();
    const { lead, event, student } = await anOngoingEvent({
      status: 'PUBLISHED',
      startsAt: new Date(now + 2 * DAY),
      endsAt: new Date(now + 2 * DAY + HOUR),
      registrationClosesAt: new Date(now + DAY),
    });
    const registered = await prisma.user.findUniqueOrThrow({ where: { id: student.userId } });

    const known = await manual(lead.sessionCookie, event.id, {
      email: registered.email,
      reason: 'Late arrival',
    });
    const unknown = await manual(lead.sessionCookie, event.id, {
      email: 'nobody-at-all@uni.ac.ae',
      reason: 'Late arrival',
    });

    expect(known.body).toEqual(unknown.body);
    expect(known.body.result).toBe('EVENT_NOT_OPEN');
  });

  it('does not distinguish a suspended account from one that does not exist', async () => {
    // The same oracle: a suspended holder must answer like an unknown address.
    const { lead, event } = await anOngoingEvent();
    const suspended = await loginAsStudent(app);
    await mkRegistration(event.id, suspended.userId, 'CONFIRMED');
    await prisma.user.update({ where: { id: suspended.userId }, data: { status: 'SUSPENDED' } });
    const row = await prisma.user.findUniqueOrThrow({ where: { id: suspended.userId } });

    const known = await manual(lead.sessionCookie, event.id, {
      email: row.email,
      reason: 'Late arrival',
    });
    const unknown = await manual(lead.sessionCookie, event.id, {
      email: 'nobody-at-all@uni.ac.ae',
      reason: 'Late arrival',
    });

    expect(known.body).toEqual(unknown.body);
    expect(known.body).toEqual({ result: 'NOT_REGISTERED' });
  });
});

describe('who may check people in', () => {
  it('lets an Operations EventAssignment holder with no club role check people in', async () => {
    // Rights for one event without a club role; catches a guard reading club roles only.
    const { lead, event, student } = await anOngoingEvent();
    const helper = await loginAsStudent(app);
    await prisma.eventAssignment.create({
      data: { eventId: event.id, userId: helper.userId, responsibility: 'OPERATIONS', assignedById: lead.userId },
    });

    const res = await checkIn(helper.sessionCookie, event.id, student.userId);

    expect(res.status).toBe(200);
    expect(res.body.result).toBe('CHECKED_IN');
  });

  it('refuses a club Marketing officer', async () => {
    const { club, event, student } = await anOngoingEvent();
    const marketing = await makeActiveOfficer(app, club.id, 'MARKETING');

    const res = await checkIn(marketing.sessionCookie, event.id, student.userId);

    expect(res.status).toBe(403);
    expect(res.body.detail).toBe('You do not have permission to do that.');
    expect(await prisma.attendanceRecord.count({ where: { eventId: event.id } })).toBe(0);

    const denied = await prisma.auditLog.findMany({ where: { outcome: 'DENIED' } });
    expect(denied[0]?.reason).toBe('attendance:check-in');
  });
});

describe('GET /events/:eventId/attendance', () => {
  it('counts what is checked in against what was expected', async () => {
    // Lead's cookie: club Operations reach attendee data only through an EventAssignment.
    const { lead, event, student } = await anOngoingEvent();
    const waiting = await loginAsStudent(app);
    await mkRegistration(event.id, waiting.userId, 'WAITLISTED', { waitlistPosition: 1 });
    await checkIn(lead.sessionCookie, event.id, student.userId);

    const res = await roster(lead.sessionCookie, event.id);

    expect(res.status).toBe(200);
    expect(res.body.checkedIn).toBe(1);
    // A waitlisted student was never expected, so the denominator is one.
    expect(res.body.expected).toBe(1);
    expect(res.body.items).toHaveLength(2);
    const checked = res.body.items.find((r: { userId: string }) => r.userId === student.userId);
    expect(checked.registrationStatus).toBe('CHECKED_IN');
    expect(checked.method).toBe('MANUAL');
  });
});

describe('PATCH /events/:eventId/attendance/:registrationId', () => {
  async function aFinishedEvent(hoursAgo: number, status: 'COMPLETED' | 'CERTIFIED' = 'COMPLETED') {
    const now = Date.now();
    const club = await mkClub();
    const lead = await makeActiveLead(app, club.id);
    const ops = await makeActiveOfficer(app, club.id, 'OPERATIONS');
    const event = await mkEvent(club.id, lead.userId, {
      status,
      startsAt: new Date(now - (hoursAgo + 2) * HOUR),
      endsAt: new Date(now - hoursAgo * HOUR),
      registrationOpensAt: new Date(now - 30 * DAY),
      registrationClosesAt: new Date(now - (hoursAgo + 3) * HOUR),
      capacity: 30,
      confirmedCount: 1,
    });
    const student = await loginAsStudent(app);
    const registration = await mkRegistration(event.id, student.userId, 'CHECKED_IN');
    await prisma.attendanceRecord.create({
      data: {
        registrationId: registration.id,
        eventId: event.id,
        userId: student.userId,
        checkedInById: ops.userId,
        method: 'MANUAL',
      },
    });
    return { club, lead, ops, event, student, registration };
  }

  it('lets Operations correct a finished event', async () => {
    const { ops, event, registration } = await aFinishedEvent(1);

    const res = await correct(ops.sessionCookie, event.id, registration.id, {
      present: false,
      reason: 'Checked in the wrong person',
    });

    expect(res.status).toBe(204);
    expect(await prisma.attendanceRecord.count({ where: { registrationId: registration.id } })).toBe(0);
    const after = await prisma.eventRegistration.findUniqueOrThrow({ where: { id: registration.id } });
    expect(after.status).toBe('NO_SHOW');

    const audit = await prisma.auditLog.findMany({ where: { action: 'attendance.corrected' } });
    expect(audit[0]?.before).toMatchObject({ status: 'CHECKED_IN' });
    expect(audit[0]?.after).toMatchObject({ status: 'NO_SHOW', present: false });
  });

  it('lets Operations correct weeks after the event, because no certificate has issued', async () => {
    // Catches a surviving clock gate: attendance locks on issuance, not on time.
    const { ops, event, registration } = await aFinishedEvent(20 * 24);

    const res = await correct(ops.sessionCookie, event.id, registration.id, {
      present: false,
      reason: 'Found on review of the paper sheet',
    });

    expect(res.status).toBe(204);
    expect(await prisma.attendanceRecord.count({ where: { registrationId: registration.id } })).toBe(0);
  });

  it('refuses Operations once certificates have issued', async () => {
    // One hour after the event, so only the CERTIFIED lock can be refusing it.
    const { ops, event, registration } = await aFinishedEvent(1, 'CERTIFIED');

    const res = await correct(ops.sessionCookie, event.id, registration.id, {
      present: false,
      reason: 'Too late',
    });

    expect(res.status).toBe(422);
    expect(res.body.detail).toBe('That event has issued certificates and its attendance is locked.');
    expect(await prisma.attendanceRecord.count({ where: { registrationId: registration.id } })).toBe(1);
  });

  it('lets an Admin cross the certificate lock with a recorded override reason', async () => {
    const { event, registration } = await aFinishedEvent(1, 'CERTIFIED');
    const admin = await loginAsAdmin(app);

    const refused = await correct(admin.sessionCookie, event.id, registration.id, {
      present: false,
      reason: 'Registrar review',
    });
    // A reasonless override is indistinguishable from a bug in the audit log, so even Admin is refused.
    expect(refused.status).toBe(422);
    expect(refused.body.detail).toBe(
      'Correcting attendance after certificates have issued requires an override reason.',
    );

    const res = await correct(admin.sessionCookie, event.id, registration.id, {
      present: false,
      reason: 'Registrar review',
      override: { reason: 'Dean requested a correction on appeal' },
    });

    expect(res.status).toBe(204);
    const audit = await prisma.auditLog.findMany({ where: { action: 'attendance.corrected' } });
    expect(audit[0]?.before).toMatchObject({ override: 'Dean requested a correction on appeal' });
  });

  it('corrects a NO_SHOW back to present, which is a status it may rewrite', async () => {
    // NO_SHOW is the ordinary correction, so the status guard must allow it.
    const { ops, event, registration } = await aFinishedEvent(1);
    await prisma.attendanceRecord.delete({ where: { registrationId: registration.id } });
    await prisma.eventRegistration.update({ where: { id: registration.id }, data: { status: 'NO_SHOW' } });

    const res = await correct(ops.sessionCookie, event.id, registration.id, {
      present: true,
      reason: 'Signed the paper sheet at the door',
    });

    expect(res.status).toBe(204);
    const after = await prisma.eventRegistration.findUniqueOrThrow({ where: { id: registration.id } });
    expect(after.status).toBe('CHECKED_IN');
    expect(await prisma.attendanceRecord.count({ where: { registrationId: registration.id } })).toBe(1);
  });

  it('refuses to correct a cancelled registration, rather than resurrecting it', async () => {
    // Without the status guard this writes CHECKED_IN over a withdrawal.
    const { ops, event, student, registration } = await aFinishedEvent(1);
    await prisma.attendanceRecord.delete({ where: { registrationId: registration.id } });
    await prisma.eventRegistration.update({
      where: { id: registration.id },
      data: { status: 'CANCELLED' },
    });

    const res = await correct(ops.sessionCookie, event.id, registration.id, {
      present: true,
      reason: 'Thought they were here',
    });

    expect(res.status).toBe(422);
    expect(res.body.detail).toBe(
      'That student cancelled their registration, so there is no attendance to correct.',
    );
    const after = await prisma.eventRegistration.findUniqueOrThrow({ where: { id: registration.id } });
    expect(after.status).toBe('CANCELLED');
    expect(await prisma.attendanceRecord.count({ where: { userId: student.userId } })).toBe(0);
  });

  it('refuses to correct a waitlisted registration, which never held a seat', async () => {
    // CHECKED_IN here would bypass confirmedCount, which the capacity CHECK guards.
    const { ops, event, registration } = await aFinishedEvent(1);
    await prisma.attendanceRecord.delete({ where: { registrationId: registration.id } });
    await prisma.eventRegistration.update({
      where: { id: registration.id },
      data: { status: 'WAITLISTED', waitlistPosition: 1 },
    });
    const before = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });

    const res = await correct(ops.sessionCookie, event.id, registration.id, {
      present: true,
      reason: 'Let them in on the night',
    });

    expect(res.status).toBe(422);
    expect(res.body.detail).toBe(
      'That student was on the waiting list and never held a place at the event.',
    );
    const after = await prisma.eventRegistration.findUniqueOrThrow({ where: { id: registration.id } });
    expect(after.status).toBe('WAITLISTED');
    expect((await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).confirmedCount).toBe(
      before.confirmedCount,
    );
  });

  it('refuses a correction before the event has started', async () => {
    // Catches a gate on CERTIFIED alone, allowing check-in before the event happens.
    const club = await mkClub();
    const lead = await makeActiveLead(app, club.id);
    const ops = await makeActiveOfficer(app, club.id, 'OPERATIONS');
    const now = Date.now();
    const event = await mkEvent(club.id, lead.userId, {
      status: 'PUBLISHED',
      registrationOpensAt: new Date(now - DAY),
      registrationClosesAt: new Date(now + DAY),
      startsAt: new Date(now + 2 * DAY),
      endsAt: new Date(now + 2 * DAY + HOUR),
      capacity: 30,
      confirmedCount: 1,
    });
    const student = await loginAsStudent(app);
    const registration = await mkRegistration(event.id, student.userId, 'CONFIRMED');

    const res = await correct(ops.sessionCookie, event.id, registration.id, {
      present: true,
      reason: 'Marked early',
    });

    expect(res.status).toBe(422);
    expect(res.body.detail).toBe('That event has not started, so there is no attendance to correct.');
    expect(await prisma.attendanceRecord.count({ where: { registrationId: registration.id } })).toBe(0);
  });

  it('refuses a correction whose registration changed while it was waiting', async () => {
    // Catches an unconditional status write over a concurrent cancellation.
    const { ops, event, registration } = await aFinishedEvent(1);

    let inFlight!: Promise<request.Response>;
    await prisma.$transaction(async (tx) => {
      await tx.eventRegistration.update({ where: { id: registration.id }, data: { status: 'CANCELLED' } });
      inFlight = correct(ops.sessionCookie, event.id, registration.id, {
        present: false,
        reason: 'Checked in the wrong person',
      }).then((r) => r);
      // Until the request finishes or has had ample time to reach its wait.
      await Promise.race([inFlight, new Promise((resolve) => setTimeout(resolve, 3000))]);
    });
    const res = await inFlight;

    expect(res.status).toBe(409);
    const after = await prisma.eventRegistration.findUniqueOrThrow({ where: { id: registration.id } });
    expect(after.status).toBe('CANCELLED');
  });

  it('refuses a registration that belongs to a different event', async () => {
    // Catches a lookup by row id alone, crossing events.
    const { ops, event } = await aFinishedEvent(1);
    const other = await aFinishedEvent(1);

    const res = await correct(ops.sessionCookie, event.id, other.registration.id, {
      present: false,
      reason: 'Wrong event entirely',
    });

    expect(res.status).toBe(404);
    expect(res.body.detail).toBe('No such registration for that event.');
    expect(
      await prisma.attendanceRecord.count({ where: { registrationId: other.registration.id } }),
    ).toBe(1);
  });
});

describe('the roster after an event completes', () => {
  it('turns everyone who never checked in into a NO_SHOW, in the same transaction as the hop', async () => {
    const now = Date.now();
    const club = await mkClub();
    const lead = await makeActiveLead(app, club.id);
    const ops = await makeActiveOfficer(app, club.id, 'OPERATIONS');
    // Stored ONGOING but already over: the next read advances it.
    const event = await mkEvent(club.id, lead.userId, {
      status: 'ONGOING',
      startsAt: new Date(now - 4 * HOUR),
      endsAt: new Date(now - 2 * HOUR),
      registrationOpensAt: new Date(now - 30 * DAY),
      registrationClosesAt: new Date(now - 5 * HOUR),
      capacity: 1,
      confirmedCount: 1,
    });
    const attended = await loginAsStudent(app);
    const absent = await loginAsStudent(app);
    const waiting = await loginAsStudent(app);
    const gone = await loginAsStudent(app);
    const attendedReg = await mkRegistration(event.id, attended.userId, 'CHECKED_IN');
    const absentReg = await mkRegistration(event.id, absent.userId, 'CONFIRMED');
    const waitingReg = await mkRegistration(event.id, waiting.userId, 'WAITLISTED', { waitlistPosition: 1 });
    const goneReg = await mkRegistration(event.id, gone.userId, 'CANCELLED');

    await request(app.getHttpServer())
      .get(`${API_PREFIX}/events/${event.id}`)
      .set('Cookie', ops.sessionCookie);

    const byId = new Map(
      (await prisma.eventRegistration.findMany({ where: { eventId: event.id } })).map((r) => [r.id, r.status]),
    );
    expect((await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).status).toBe('COMPLETED');
    expect(byId.get(absentReg.id)).toBe('NO_SHOW');
    // A waitlisted student never held a seat, so they cannot be a no-show.
    expect(byId.get(waitingReg.id)).toBe('WAITLISTED');
    // Attendance and a withdrawal are both records of something that happened.
    expect(byId.get(attendedReg.id)).toBe('CHECKED_IN');
    expect(byId.get(goneReg.id)).toBe('CANCELLED');
  });

  it('still counts only the seats that were held, after the hop to COMPLETED', async () => {
    // Checks after completion, when waitlisted rows swept into NO_SHOW would skew the counter.
    const now = Date.now();
    const club = await mkClub();
    const lead = await makeActiveLead(app, club.id);
    const event = await mkEvent(club.id, lead.userId, {
      status: 'ONGOING',
      startsAt: new Date(now - 4 * HOUR),
      endsAt: new Date(now - 2 * HOUR),
      registrationOpensAt: new Date(now - 30 * DAY),
      registrationClosesAt: new Date(now - 5 * HOUR),
      capacity: 1,
      confirmedCount: 1,
    });
    const attended = await loginAsStudent(app);
    const waiting = await loginAsStudent(app);
    await mkRegistration(event.id, attended.userId, 'CHECKED_IN');
    await mkRegistration(event.id, waiting.userId, 'WAITLISTED', { waitlistPosition: 1 });

    // Reading the event advances it, not the roster, matching EventEditor's load order.
    await request(app.getHttpServer())
      .get(`${API_PREFIX}/events/${event.id}`)
      .set('Cookie', lead.sessionCookie);
    const res = await roster(lead.sessionCookie, event.id);

    expect(res.status).toBe(200);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).status).toBe('COMPLETED');
    expect(res.body.expected).toBe(1);
  });
});

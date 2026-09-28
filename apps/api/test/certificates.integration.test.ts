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

/** Every club core-team role, which is exactly who may issue. */
const CORE_TEAM = ['LEAD', 'VICE_LEAD', 'MARKETING', 'CTO', 'OPERATIONS'] as const;

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

function issue(cookie: string, eventId: string) {
  return request(app.getHttpServer())
    .post(`${API_PREFIX}/events/${eventId}/certificates/issue`)
    .set('Cookie', cookie)
    .send({});
}

/** Ended an hour ago, one student checked in and one not. */
async function aCertifiableEvent(overrides: Record<string, unknown> = {}, endedAgo = HOUR) {
  const now = Date.now();
  const endedAt = now - endedAgo;
  const club = await mkClub();
  const lead = await makeActiveLead(app, club.id);
  const ops = await makeActiveOfficer(app, club.id, 'OPERATIONS');
  const event = await mkEvent(club.id, lead.userId, {
    status: 'COMPLETED',
    certificateEnabled: true,
    certificateTitle: 'Certificate of Participation',
    certificateSignatory: 'Dr A Person, Dean of Students',
    startsAt: new Date(endedAt - 2 * HOUR),
    endsAt: new Date(endedAt),
    registrationOpensAt: new Date(endedAt - 30 * DAY),
    registrationClosesAt: new Date(endedAt - 3 * HOUR),
    capacity: 30,
    confirmedCount: 2,
    ...overrides,
  });

  const attendee = await loginAsStudent(app, { fullName: 'Amina Hassan' });
  const absentee = await loginAsStudent(app, { fullName: 'Never Came' });
  const attended = await mkRegistration(event.id, attendee.userId, 'CHECKED_IN');
  const missed = await mkRegistration(event.id, absentee.userId, 'NO_SHOW');
  await prisma.attendanceRecord.create({
    data: {
      registrationId: attended.id,
      eventId: event.id,
      userId: attendee.userId,
      checkedInById: ops.userId,
      method: 'MANUAL',
    },
  });

  return { club, lead, ops, event, attendee, absentee, attended, missed };
}

describe('POST /events/:eventId/certificates/issue', () => {
  it('issues one certificate per attendee and certifies the event', async () => {
    const { event, attendee, club } = await aCertifiableEvent();
    const admin = await loginAsAdmin(app);

    const res = await issue(admin.sessionCookie, event.id);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ issued: 1, total: 1 });

    const rows = await prisma.certificate.findMany({ where: { eventId: event.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBe(attendee.userId);
    // Snapshots filled at issuance, so a later rename cannot rewrite the certificate.
    expect(rows[0]?.holderNameSnapshot).toBe('Amina Hassan');
    expect(rows[0]?.eventTitleSnapshot).toBe(event.title);
    expect(rows[0]?.clubNameSnapshot).toBe(club.name);
    expect(rows[0]?.clubLogoSnapshotUrl).toBe(club.logoUrl);

    expect((await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).status).toBe('CERTIFIED');
    const audit = await prisma.auditLog.findMany({ where: { action: 'certificate.issued_for_event' } });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.after).toMatchObject({ status: 'CERTIFIED', issued: 1 });
  });

  it('issues for a finished event whose stored status nobody has advanced yet', async () => {
    // The lazy lifecycle may still read PUBLISHED; Issue must advance it, not refuse it.
    const { event } = await aCertifiableEvent({ status: 'PUBLISHED' });
    const admin = await loginAsAdmin(app);

    const res = await issue(admin.sessionCookie, event.id);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ issued: 1, total: 1 });
    expect((await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).status).toBe('CERTIFIED');
  });

  it('issues nothing the second time it runs', async () => {
    // The partial unique index is the guarantee; a second run must be a no-op.
    const { event } = await aCertifiableEvent();
    const admin = await loginAsAdmin(app);

    const first = await issue(admin.sessionCookie, event.id);
    const second = await issue(admin.sessionCookie, event.id);

    expect(first.body).toEqual({ issued: 1, total: 1 });
    expect(second.body).toEqual({ issued: 0, total: 1 });
    expect(await prisma.certificate.count({ where: { eventId: event.id } })).toBe(1);
    // No second CERTIFIED audit row for a transition that did not happen.
    expect(await prisma.auditLog.count({ where: { action: 'certificate.issued_for_event' } })).toBe(1);
  });

  it('audits every press that issues something, naming who pressed it', async () => {
    // Catches an audit written only on the COMPLETED to CERTIFIED hop.
    const { event, lead, missed } = await aCertifiableEvent();
    const admin = await loginAsAdmin(app);
    await issue(lead.sessionCookie, event.id);

    const corrected = await request(app.getHttpServer())
      .patch(`${API_PREFIX}/events/${event.id}/attendance/${missed.id}`)
      .set('Cookie', admin.sessionCookie)
      .send({ present: true, reason: 'Signed the paper sheet', override: { reason: 'Registrar review' } });
    expect(corrected.status).toBe(204);

    const second = await issue(lead.sessionCookie, event.id);
    expect(second.body).toEqual({ issued: 1, total: 2 });

    const audit = await prisma.auditLog.findMany({
      where: { action: 'certificate.issued_for_event' },
      orderBy: { id: 'asc' },
    });
    expect(audit.map((a) => a.actorUserId)).toEqual([lead.userId, lead.userId]);
    expect(audit[1]?.after).toMatchObject({ issued: 1, total: 2 });
  });

  it('gives a NO_SHOW nothing', async () => {
    const { event, absentee } = await aCertifiableEvent();
    const admin = await loginAsAdmin(app);

    await issue(admin.sessionCookie, event.id);

    expect(await prisma.certificate.count({ where: { userId: absentee.userId } })).toBe(0);
  });

  it('refuses an event that has not finished yet', async () => {
    const now = Date.now();
    const { event } = await aCertifiableEvent({
      status: 'ONGOING',
      startsAt: new Date(now - HOUR),
      endsAt: new Date(now + HOUR),
    });
    const admin = await loginAsAdmin(app);

    const res = await issue(admin.sessionCookie, event.id);

    expect(res.status).toBe(422);
    expect(res.body.detail).toBe('That event has not finished yet.');
    expect(await prisma.certificate.count({ where: { eventId: event.id } })).toBe(0);
  });

  it.each(CORE_TEAM)('lets the club %s issue', async (role) => {
    const { club, event, lead } = await aCertifiableEvent();
    // A club holds one active Lead, and the fixture already appointed it.
    const officer = role === 'LEAD' ? lead : await makeActiveOfficer(app, club.id, role);

    const res = await issue(officer.sessionCookie, event.id);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ issued: 1, total: 1 });
  });

  it('refuses a Lead of a different club', async () => {
    // Catches an unscoped rule: a club role anywhere must not reach this club.
    const { event } = await aCertifiableEvent();
    const elsewhere = await mkClub();
    const stranger = await makeActiveLead(app, elsewhere.id);

    const res = await issue(stranger.sessionCookie, event.id);

    expect(res.status).toBe(403);
    expect(await prisma.certificate.count({ where: { eventId: event.id } })).toBe(0);
    const denied = await prisma.auditLog.findMany({ where: { outcome: 'DENIED' } });
    expect(denied[0]?.reason).toBe('certificate:manage');
  });

  it('refuses a student with no role in the club', async () => {
    const { event, attendee } = await aCertifiableEvent();

    const res = await issue(attendee.sessionCookie, event.id);

    expect(res.status).toBe(403);
  });
});

describe('nothing issues on its own', () => {
  // Attendance stays correctable until issuance, so issuance is never automatic.
  it('opening a finished event issues nothing', async () => {
    const { event, lead } = await aCertifiableEvent({}, 20 * DAY);

    const res = await request(app.getHttpServer())
      .get(`${API_PREFIX}/events/${event.id}`)
      .set('Cookie', lead.sessionCookie);

    expect(res.status).toBe(200);
    expect(await prisma.certificate.count({ where: { eventId: event.id } })).toBe(0);
  });
});

describe('POST /certificates/:id/revoke', () => {
  it('marks the certificate REVOKED with its date and audits the reason', async () => {
    const { event } = await aCertifiableEvent();
    const admin = await loginAsAdmin(app);
    await issue(admin.sessionCookie, event.id);
    const certificate = await prisma.certificate.findFirstOrThrow({ where: { eventId: event.id } });

    const revoked = await request(app.getHttpServer())
      .post(`${API_PREFIX}/certificates/${certificate.id}/revoke`)
      .set('Cookie', admin.sessionCookie)
      .send({ reason: 'Issued against a corrected attendance record' });
    expect(revoked.status).toBe(200);

    expect(revoked.body.status).toBe('REVOKED');
    expect(revoked.body.revokedAt).not.toBeNull();
    const row = await prisma.certificate.findUniqueOrThrow({ where: { id: certificate.id } });
    expect(row.status).toBe('REVOKED');

    const audit = await prisma.auditLog.findMany({ where: { action: 'certificate.revoked' } });
    expect(audit[0]?.reason).toBe('Issued against a corrected attendance record');
  });

  it("refuses another club's Lead", async () => {
    // The guard resolves the club through the certificate, so a Lead elsewhere holds nothing.
    const { event } = await aCertifiableEvent();
    const admin = await loginAsAdmin(app);
    await issue(admin.sessionCookie, event.id);
    const certificate = await prisma.certificate.findFirstOrThrow({ where: { eventId: event.id } });
    const stranger = await makeActiveLead(app, (await mkClub()).id);

    const res = await request(app.getHttpServer())
      .post(`${API_PREFIX}/certificates/${certificate.id}/revoke`)
      .set('Cookie', stranger.sessionCookie)
      .send({ reason: 'Not my club' });

    expect(res.status).toBe(403);
    expect((await prisma.certificate.findUniqueOrThrow({ where: { id: certificate.id } })).status).toBe('ACTIVE');
  });
});

describe('an attendance correction after the certificates have issued', () => {
  it('revokes the certificate of someone corrected to absent', async () => {
    const { event, attended } = await aCertifiableEvent();
    const admin = await loginAsAdmin(app);
    await issue(admin.sessionCookie, event.id);
    const certificate = await prisma.certificate.findFirstOrThrow({ where: { eventId: event.id } });
    expect(certificate.status).toBe('ACTIVE');

    // Catches a correction that does not revoke, leaving the certificate ACTIVE.
    const res = await request(app.getHttpServer())
      .patch(`${API_PREFIX}/events/${event.id}/attendance/${attended.id}`)
      .set('Cookie', admin.sessionCookie)
      .send({
        present: false,
        reason: 'Checked in the wrong person at the door',
        override: { reason: 'Registrar review after the event was certified' },
      });

    expect(res.status).toBe(204);

    const row = await prisma.certificate.findUniqueOrThrow({ where: { id: certificate.id } });
    expect(row.status).toBe('REVOKED');
    expect(row.revokedAt).not.toBeNull();
    expect(row.revokedById).toBe(admin.userId);
    expect(row.revokedReason).toBe('Checked in the wrong person at the door');

    // Audited in the same transaction as the correction.
    const audit = await prisma.auditLog.findMany({ where: { action: 'certificate.revoked' } });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.actorUserId).toBe(admin.userId);
    expect(audit[0]?.reason).toBe('Checked in the wrong person at the door');
  });
});

describe('a correction racing issuance', () => {
  // Holds the event row lock uncommitted. Do not return inFlight from the callback:
  // Prisma awaits the return value before committing.
  async function whileHeld(eventId: string, write: (tx: typeof prisma) => Promise<unknown>, send: () => Promise<request.Response>) {
    let inFlight!: Promise<request.Response>;
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "event" WHERE "id" = ${eventId}::uuid FOR UPDATE`;
      await write(tx as typeof prisma);
      inFlight = send().then((r) => r);
      // Until the request finishes or has had ample time to reach its wait.
      await Promise.race([inFlight, new Promise((resolve) => setTimeout(resolve, 3000))]);
    });
    return inFlight;
  }

  it('issues nothing to someone corrected to absent while the issue was waiting', async () => {
    // Catches issuing without the event lock, which certifies a NO_SHOW.
    const { event, lead, attended } = await aCertifiableEvent();

    const res = await whileHeld(
      event.id,
      async (tx) => {
        await tx.attendanceRecord.delete({ where: { registrationId: attended.id } });
        await tx.eventRegistration.update({ where: { id: attended.id }, data: { status: 'NO_SHOW' } });
      },
      () => issue(lead.sessionCookie, event.id),
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ issued: 0, total: 0 });
    expect(await prisma.certificate.count({ where: { registrationId: attended.id } })).toBe(0);
  });

  it('refuses a correction that waited on issuance, rather than leaving a NO_SHOW certified', async () => {
    // Catches a correction reading the event without the lock, leaving an ACTIVE certificate beside a NO_SHOW.
    const { event, ops, attendee, attended } = await aCertifiableEvent();

    const res = await whileHeld(
      event.id,
      async (tx) => {
        await tx.certificate.create({
          data: {
            registrationId: attended.id,
            eventId: event.id,
            userId: attendee.userId,
            serialNumber: 'MJ-RACE-0001',
            verificationCode: 'race-code-0001',
            holderNameSnapshot: 'Amina Hassan',
            eventTitleSnapshot: event.title,
            clubNameSnapshot: 'A Club',
            clubLogoSnapshotUrl: 'https://example.test/logo.png',
          },
        });
        await tx.event.update({ where: { id: event.id }, data: { status: 'CERTIFIED' } });
      },
      () =>
        request(app.getHttpServer())
          .patch(`${API_PREFIX}/events/${event.id}/attendance/${attended.id}`)
          .set('Cookie', ops.sessionCookie)
          .send({ present: false, reason: 'Checked in the wrong person' }),
    );

    expect(res.status).toBe(422);
    expect(res.body.detail).toBe('That event has issued certificates and its attendance is locked.');
    const after = await prisma.eventRegistration.findUniqueOrThrow({ where: { id: attended.id } });
    expect(after.status).toBe('CHECKED_IN');
  });
});

describe('POST /certificates/:id/revoke, twice at once', () => {
  it('refuses the second revocation rather than overwriting the first', async () => {
    // Catches a check-then-update overwriting revokedBy with a second audit row.
    const { event } = await aCertifiableEvent();
    const admin = await loginAsAdmin(app);
    const other = await loginAsAdmin(app);
    await issue(admin.sessionCookie, event.id);
    const certificate = await prisma.certificate.findFirstOrThrow({ where: { eventId: event.id } });

    let inFlight!: Promise<request.Response>;
    await prisma.$transaction(async (tx) => {
      await tx.certificate.update({
        where: { id: certificate.id },
        data: { status: 'REVOKED', revokedAt: new Date(), revokedById: other.userId, revokedReason: 'First' },
      });
      inFlight = request(app.getHttpServer())
        .post(`${API_PREFIX}/certificates/${certificate.id}/revoke`)
        .set('Cookie', admin.sessionCookie)
        .send({ reason: 'Second' })
        .then((r) => r);
      // Until the request finishes or has had ample time to reach its wait.
      await Promise.race([inFlight, new Promise((resolve) => setTimeout(resolve, 3000))]);
    });
    const res = await inFlight;

    expect(res.status).toBe(409);
    const row = await prisma.certificate.findUniqueOrThrow({ where: { id: certificate.id } });
    expect(row.revokedById).toBe(other.userId);
    expect(row.revokedReason).toBe('First');
    expect(await prisma.auditLog.count({ where: { action: 'certificate.revoked' } })).toBe(0);
  });
});

describe('snapshots', () => {
  it('survive a club rename', async () => {
    const { event, club, attendee } = await aCertifiableEvent();
    const admin = await loginAsAdmin(app);
    await issue(admin.sessionCookie, event.id);

    await prisma.club.update({ where: { id: club.id }, data: { name: 'Something Else Entirely' } });

    const mine = await request(app.getHttpServer())
      .get(`${API_PREFIX}/me/certificates`)
      .set('Cookie', attendee.sessionCookie);
    expect(mine.body.items[0].clubName).toBe(club.name);
  });
});

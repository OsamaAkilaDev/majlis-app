import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { API_PREFIX } from '../src/config/api-prefix';
import { createTestApp } from './app';
import { loginAsAdmin, loginAsStudent } from './auth-helpers';
import { truncateAll } from './db';
import { afterCompetingWrite } from './clubs-stale-write';
import { inviteOfficer, makeActiveLead, makeActiveOfficer, mkAppointment, mkClub, testDb } from './factories';

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

describe('POST /clubs/:clubId/lead', () => {
  it('creates an INVITED appointment that grants nothing yet', async () => {
    const admin = await loginAsAdmin(app);
    const club = await mkClub();
    const nominee = await loginAsStudent(app);

    const res = await request(app.getHttpServer())
      .post(`${API_PREFIX}/clubs/${club.id}/lead`)
      .set('Cookie', admin.sessionCookie)
      .send({ userId: nominee.userId });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('INVITED');

    // Catches an appointment created ACTIVE before acceptance.
    expect(
      (
        await request(app.getHttpServer())
          .patch(`${API_PREFIX}/clubs/${club.id}`)
          .set('Cookie', nominee.sessionCookie)
          .send({ category: 'Engineering' })
      ).status,
    ).toBe(403);
  });

  it('refuses a Lead appointing their own successor', async () => {
    const club = await mkClub();
    const lead = await makeActiveLead(app, club.id);
    const nominee = await loginAsStudent(app);

    expect(
      (
        await request(app.getHttpServer())
          .post(`${API_PREFIX}/clubs/${club.id}/lead`)
          .set('Cookie', lead.sessionCookie)
          .send({ userId: nominee.userId })
      ).status,
    ).toBe(403);
  });
});

describe('the one ACTIVE Lead index', () => {
  it('admits two INVITED Leads but only the first acceptance', async () => {
    // The partial index covers ACTIVE only, so it fires at acceptance. Two users, so the index must discriminate.
    const admin = await loginAsAdmin(app);
    const club = await mkClub();
    const first = await loginAsStudent(app);
    const second = await loginAsStudent(app);

    const inviteLead = (userId: string) =>
      request(app.getHttpServer())
        .post(`${API_PREFIX}/clubs/${club.id}/lead`)
        .set('Cookie', admin.sessionCookie)
        .send({ userId });

    const a = await inviteLead(first.userId);
    const b = await inviteLead(second.userId);
    expect([a.status, b.status]).toEqual([201, 201]);

    expect(
      (
        await request(app.getHttpServer())
          .post(`${API_PREFIX}/appointments/${a.body.id}/accept`)
          .set('Cookie', first.sessionCookie)
      ).status,
    ).toBe(201);

    const secondAccept = await request(app.getHttpServer())
      .post(`${API_PREFIX}/appointments/${b.body.id}/accept`)
      .set('Cookie', second.sessionCookie);
    expect(secondAccept.status).toBe(409);
    // The filter maps any P2002 to 409, so the detail proves the mapping fired.
    expect(secondAccept.body.detail).toBe('That club already has an active Lead.');

    const active = await prisma.clubTeamAppointment.findMany({
      where: { clubId: club.id, role: 'LEAD', status: 'ACTIVE' },
    });
    expect(active).toHaveLength(1);
    expect(active[0]!.userId).toBe(first.userId);
  });
});

describe('POST /clubs/:clubId/team', () => {
  it('lets a Lead invite an officer and refuses a Vice Lead', async () => {
    const club = await mkClub();
    const lead = await makeActiveLead(app, club.id);
    const vice = await makeActiveOfficer(app, club.id, 'VICE_LEAD');
    const nominee = await loginAsStudent(app);

    const invite = (cookie: string) =>
      request(app.getHttpServer())
        .post(`${API_PREFIX}/clubs/${club.id}/team`)
        .set('Cookie', cookie)
        .send({ userId: nominee.userId, role: 'MARKETING' });

    expect((await invite(lead.sessionCookie)).status).toBe(201);
    // Inviting and ending team appointments is Lead only.
    expect((await invite(vice.sessionCookie)).status).toBe(403);

    // Catches a missing or misscoped guard letting the denied call insert a row.
    const rows = await prisma.clubTeamAppointment.findMany({
      where: { clubId: club.id, userId: nominee.userId, role: 'MARKETING' },
    });
    expect(rows).toHaveLength(1);
  });

  it('refuses a Lead inviting themselves', async () => {
    const club = await mkClub();
    const lead = await makeActiveLead(app, club.id);

    expect(
      (
        await request(app.getHttpServer())
          .post(`${API_PREFIX}/clubs/${club.id}/team`)
          .set('Cookie', lead.sessionCookie)
          .send({ userId: lead.userId, role: 'CTO' })
      ).status,
    ).toBe(422);

    const rows = await prisma.clubTeamAppointment.findMany({
      where: { clubId: club.id, userId: lead.userId, role: 'CTO' },
    });
    expect(rows).toHaveLength(0);
  });

  it('refuses inviting a user who already holds an ACTIVE appointment in that role', async () => {
    const club = await mkClub();
    const lead = await makeActiveLead(app, club.id);
    const officer = await makeActiveOfficer(app, club.id, 'MARKETING');

    const res = await request(app.getHttpServer())
      .post(`${API_PREFIX}/clubs/${club.id}/team`)
      .set('Cookie', lead.sessionCookie)
      .send({ userId: officer.userId, role: 'MARKETING' });

    expect(res.status).toBe(409);

    const rows = await prisma.clubTeamAppointment.findMany({
      where: { clubId: club.id, userId: officer.userId, role: 'MARKETING' },
    });
    expect(rows).toHaveLength(1);
  });
});

describe('one open appointment per (club, user, role)', () => {
  function invite(cookie: string, clubId: string, userId: string) {
    return request(app.getHttpServer())
      .post(`${API_PREFIX}/clubs/${clubId}/team`)
      .set('Cookie', cookie)
      .send({ userId, role: 'VICE_LEAD' });
  }

  it('refuses a second invitation to the same role while the first is open', async () => {
    // Accepting both would leave two ACTIVE Vice Lead rows for one person.
    const club = await mkClub();
    const lead = await makeActiveLead(app, club.id);
    const nominee = await loginAsStudent(app);

    expect((await invite(lead.sessionCookie, club.id, nominee.userId)).status).toBe(201);
    const second = await invite(lead.sessionCookie, club.id, nominee.userId);
    expect(second.status).toBe(409);
    expect(second.body.detail).toBe('That user already holds or has been offered that role.');
    expect(await prisma.clubTeamAppointment.count({ where: { clubId: club.id, userId: nominee.userId } })).toBe(1);
  });

  it('lets a lapsed invitation be replaced, expiring the old row', async () => {
    const club = await mkClub();
    const lead = await makeActiveLead(app, club.id);
    const nominee = await loginAsStudent(app);
    const first = await invite(lead.sessionCookie, club.id, nominee.userId);
    await prisma.clubTeamAppointment.update({
      where: { id: first.body.id },
      data: { invitationExpiresAt: new Date(Date.now() - 1000) },
    });

    expect((await invite(lead.sessionCookie, club.id, nominee.userId)).status).toBe(201);
    expect((await prisma.clubTeamAppointment.findUniqueOrThrow({ where: { id: first.body.id } })).status).toBe('EXPIRED');
  });
});

describe('GET /clubs/:clubId/team', () => {
  it('computes hasLeftClub from the ClubMembership row, not the appointment role', async () => {
    const club = await mkClub();
    // Only club:team-manage sees addresses, so a Lead reads it.
    const viewer = await makeActiveLead(app, club.id);
    const stillMember = await makeActiveOfficer(app, club.id, 'MARKETING');
    await prisma.clubMembership.create({ data: { clubId: club.id, userId: stillMember.userId, status: 'ACTIVE' } });
    // Same role, no membership row, so hasLeftClub must come from a ClubMembership lookup.
    const left = await makeActiveOfficer(app, club.id, 'MARKETING');

    const res = await request(app.getHttpServer())
      .get(`${API_PREFIX}/clubs/${club.id}/team`)
      .set('Cookie', viewer.sessionCookie);

    expect(res.status).toBe(200);
    const byUser = new Map<string, { hasLeftClub: boolean; userEmail: string }>(
      res.body.items.map((a: { userId: string; hasLeftClub: boolean; userEmail: string }) => [a.userId, a]),
    );
    expect(byUser.get(stillMember.userId)?.hasLeftClub).toBe(false);
    expect(byUser.get(left.userId)?.hasLeftClub).toBe(true);
    expect(byUser.get(left.userId)?.userEmail).toBeTruthy();
  });
});

describe('DELETE /clubs/:clubId/team/:appointmentId', () => {
  it('refuses an appointment that belongs to another club', async () => {
    // Scope comes from params.clubId, so the handler must check the appointment's club.
    const clubA = await mkClub();
    const clubB = await mkClub();
    const leadA = await makeActiveLead(app, clubA.id);
    const officerB = await makeActiveOfficer(app, clubB.id, 'OPERATIONS');

    const res = await request(app.getHttpServer())
      .delete(`${API_PREFIX}/clubs/${clubA.id}/team/${officerB.appointmentId}`)
      .set('Cookie', leadA.sessionCookie)
      .send({ reason: 'Cross club attempt.' });

    expect(res.status).toBe(404);
    const after = await prisma.clubTeamAppointment.findUniqueOrThrow({
      where: { id: officerB.appointmentId },
    });
    expect(after.status).toBe('ACTIVE');
  });

  it('ends an appointment without deleting the row or the membership', async () => {
    const club = await mkClub();
    const lead = await makeActiveLead(app, club.id);
    const officer = await makeActiveOfficer(app, club.id, 'MARKETING');
    await prisma.clubMembership.create({
      data: { clubId: club.id, userId: officer.userId, status: 'ACTIVE' },
    });

    expect(
      (
        await request(app.getHttpServer())
          .delete(`${API_PREFIX}/clubs/${club.id}/team/${officer.appointmentId}`)
          .set('Cookie', lead.sessionCookie)
          .send({ reason: 'Term over.' })
      ).status,
    ).toBe(204);

    const row = await prisma.clubTeamAppointment.findUniqueOrThrow({ where: { id: officer.appointmentId } });
    expect(row.status).toBe('ENDED');
    expect(row.endedReason).toBe('Term over.');

    // Losing a role is not the same as leaving the club.
    const membership = await prisma.clubMembership.findFirstOrThrow({
      where: { clubId: club.id, userId: officer.userId },
    });
    expect(membership.status).toBe('ACTIVE');
  });

  it('refuses a Lead ending their own appointment', async () => {
    const club = await mkClub();
    const lead = await makeActiveLead(app, club.id);

    expect(
      (
        await request(app.getHttpServer())
          .delete(`${API_PREFIX}/clubs/${club.id}/team/${lead.appointmentId}`)
          .set('Cookie', lead.sessionCookie)
          .send({ reason: 'Resigning.' })
      ).status,
    ).toBe(422);

    const row = await prisma.clubTeamAppointment.findUniqueOrThrow({ where: { id: lead.appointmentId } });
    expect(row.status).toBe('ACTIVE');
  });

  it('refuses ending an appointment that is still INVITED, leaving it unchanged', async () => {
    const club = await mkClub();
    const lead = await makeActiveLead(app, club.id);
    const nominee = await loginAsStudent(app);
    const invited = await mkAppointment({
      userId: nominee.userId,
      clubId: club.id,
      role: 'MARKETING',
      status: 'INVITED',
    });

    const res = await request(app.getHttpServer())
      .delete(`${API_PREFIX}/clubs/${club.id}/team/${invited.id}`)
      .set('Cookie', lead.sessionCookie)
      .send({ reason: 'Rescinding.' });

    expect(res.status).toBe(422);
    const after = await prisma.clubTeamAppointment.findUniqueOrThrow({ where: { id: invited.id } });
    expect(after.status).toBe('INVITED');
  });

  it('refuses ending an appointment that is already ENDED, leaving the first ending intact', async () => {
    const club = await mkClub();
    const lead = await makeActiveLead(app, club.id);
    const officer = await makeActiveOfficer(app, club.id, 'MARKETING');

    const first = await request(app.getHttpServer())
      .delete(`${API_PREFIX}/clubs/${club.id}/team/${officer.appointmentId}`)
      .set('Cookie', lead.sessionCookie)
      .send({ reason: 'Term over.' });
    expect(first.status).toBe(204);

    const afterFirst = await prisma.clubTeamAppointment.findUniqueOrThrow({ where: { id: officer.appointmentId } });

    const second = await request(app.getHttpServer())
      .delete(`${API_PREFIX}/clubs/${club.id}/team/${officer.appointmentId}`)
      .set('Cookie', lead.sessionCookie)
      .send({ reason: 'Overwriting the record.' });
    expect(second.status).toBe(422);

    // Without the guard a second end rewrites who ended it and why.
    const afterSecond = await prisma.clubTeamAppointment.findUniqueOrThrow({ where: { id: officer.appointmentId } });
    expect(afterSecond.endedAt).toEqual(afterFirst.endedAt);
    expect(afterSecond.endedReason).toBe(afterFirst.endedReason);
    expect(afterSecond.endedReason).toBe('Term over.');
  });
});

describe('stale team writes', () => {
  it('refuses ending an appointment another officer has just ended', async () => {
    const club = await mkClub();
    const lead = await makeActiveLead(app, club.id);
    const officer = await makeActiveOfficer(app, club.id, 'MARKETING');

    const res = await afterCompetingWrite(
      prisma,
      (tx) => tx.clubTeamAppointment.update({
        where: { id: officer.appointmentId },
        data: { status: 'ENDED', endedAt: new Date(), endedReason: 'First.' },
      }),
      () => request(app.getHttpServer())
        .delete(`${API_PREFIX}/clubs/${club.id}/team/${officer.appointmentId}`)
        .set('Cookie', lead.sessionCookie)
        .send({ reason: 'Second.' }),
    );

    expect(res.status).toBe(409);
    const row = await prisma.clubTeamAppointment.findUniqueOrThrow({ where: { id: officer.appointmentId } });
    expect(row.endedReason).toBe('First.');
    expect(await prisma.auditLog.count({ where: { action: 'club.appointment_ended' } })).toBe(0);
  });

  it('refuses accepting an invitation declined a moment earlier', async () => {
    const club = await mkClub();
    const nominee = await loginAsStudent(app);
    const appt = await inviteOfficer(club.id, nominee.userId, 'CTO');

    const res = await afterCompetingWrite(
      prisma,
      (tx) => tx.clubTeamAppointment.update({ where: { id: appt.id }, data: { status: 'DECLINED' } }),
      () => request(app.getHttpServer())
        .post(`${API_PREFIX}/appointments/${appt.id}/accept`)
        .set('Cookie', nominee.sessionCookie),
    );

    expect(res.status).toBe(409);
    expect((await prisma.clubTeamAppointment.findUniqueOrThrow({ where: { id: appt.id } })).status).toBe('DECLINED');
    // The rollback must take the membership accept would have granted with it.
    expect(await prisma.clubMembership.count({ where: { clubId: club.id, userId: nominee.userId } })).toBe(0);
  });
});

describe('admin override on a team invitation', () => {
  it('refuses a club-roleless admin with no reason and records one when given', async () => {
    // An admin invite is an override; catches it recording reason null.
    const club = await mkClub();
    const admin = await loginAsAdmin(app);
    const nominee = await loginAsStudent(app);

    const invite = (body: object) =>
      request(app.getHttpServer())
        .post(`${API_PREFIX}/clubs/${club.id}/team`)
        .set('Cookie', admin.sessionCookie)
        .send(body);

    const bare = await invite({ userId: nominee.userId, role: 'MARKETING' });
    expect(bare.status).toBe(422);
    expect(bare.body.detail).toBe('An admin override requires a reason.');
    expect(await prisma.clubTeamAppointment.count({ where: { clubId: club.id } })).toBe(0);

    const withReason = await invite({
      userId: nominee.userId,
      role: 'MARKETING',
      overrideReason: 'The club has no Lead to do it.',
    });
    expect(withReason.status).toBe(201);

    const row = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'club.officer_invited', entityId: withReason.body.id },
    });
    expect(row.reason).toBe('The club has no Lead to do it.');
  });
});

describe('GET /clubs/:clubId/team, email visibility', () => {
  // The address is gated in the projection. Two readers, since either alone passes a broken handler.
  it('sends userEmail to a Lead and omits it entirely for a member with no role', async () => {
    const club = await mkClub();
    const officer = await makeActiveOfficer(app, club.id, 'OPERATIONS');
    const lead = await makeActiveLead(app, club.id);
    const bystander = await loginAsStudent(app);
    await prisma.clubMembership.create({
      data: { clubId: club.id, userId: bystander.userId, status: 'ACTIVE' },
    });

    const read = (cookie: string) =>
      request(app.getHttpServer()).get(`${API_PREFIX}/clubs/${club.id}/team`).set('Cookie', cookie);

    const asLead = await read(lead.sessionCookie);
    const asBystander = await read(bystander.sessionCookie);

    expect(asLead.status).toBe(200);
    expect(asBystander.status).toBe(200);

    const rowFor = (res: request.Response) =>
      res.body.items.find((a: { userId: string }) => a.userId === officer.userId);

    expect(rowFor(asLead).userEmail).toBeTruthy();
    // The list itself stays open: the bystander still sees the officer.
    expect(rowFor(asBystander).userFullName).toBeTruthy();
    // Omitted, not nulled.
    expect(rowFor(asBystander)).not.toHaveProperty('userEmail');
  });
});

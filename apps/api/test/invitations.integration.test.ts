import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { API_PREFIX } from '../src/config/api-prefix';
import { createTestApp } from './app';
import { loginAsStudent } from './auth-helpers';
import { truncateAll } from './db';
import { inviteOfficer, mkAppointment, mkClub, testDb } from './factories';

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

describe('GET /me/invitations', () => {
  it('lists only the caller own pending invitations', async () => {
    const club = await mkClub();
    const mine = await loginAsStudent(app);
    const theirs = await loginAsStudent(app);
    await inviteOfficer(club.id, mine.userId, 'MARKETING');
    await inviteOfficer(club.id, theirs.userId, 'CTO');

    const res = await request(app.getHttpServer())
      .get(`${API_PREFIX}/me/invitations`)
      .set('Cookie', mine.sessionCookie);

    // Catches a findMany with no userId filter.
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].role).toBe('MARKETING');
  });

  it('hides an expired invitation', async () => {
    const club = await mkClub();
    const user = await loginAsStudent(app);
    const appt = await inviteOfficer(club.id, user.userId, 'CTO');
    await prisma.clubTeamAppointment.update({
      where: { id: appt.id },
      data: { invitationExpiresAt: new Date(Date.now() - 1000) },
    });

    const res = await request(app.getHttpServer())
      .get(`${API_PREFIX}/me/invitations`)
      .set('Cookie', user.sessionCookie);

    // Catches filtering on status alone, listing expired invitations.
    expect(res.body.items).toHaveLength(0);
  });

  it('hides a null-expiry invitation rather than crashing on it', async () => {
    // The WHERE must exclude null expiry, or toInvitation's non-null assertion 500s.
    const club = await mkClub();
    const user = await loginAsStudent(app);
    await mkAppointment({ userId: user.userId, clubId: club.id, role: 'CTO', status: 'INVITED' });

    const res = await request(app.getHttpServer())
      .get(`${API_PREFIX}/me/invitations`)
      .set('Cookie', user.sessionCookie);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
  });
});

describe('POST /appointments/:appointmentId/accept', () => {
  it('activates the appointment and creates the ordinary membership', async () => {
    const club = await mkClub();
    const user = await loginAsStudent(app);
    const appt = await inviteOfficer(club.id, user.userId, 'OPERATIONS');

    expect(
      (
        await request(app.getHttpServer())
          .post(`${API_PREFIX}/appointments/${appt.id}/accept`)
          .set('Cookie', user.sessionCookie)
      ).status,
    ).toBe(201);

    const row = await prisma.clubTeamAppointment.findUniqueOrThrow({ where: { id: appt.id } });
    expect(row.status).toBe('ACTIVE');
    expect(row.acceptedAt).not.toBeNull();

    // Accepting also grants a club membership.
    const membership = await prisma.clubMembership.findFirstOrThrow({
      where: { clubId: club.id, userId: user.userId },
    });
    expect(membership.status).toBe('ACTIVE');
  });

  it('does not create a second membership when one is already open', async () => {
    // Catches an unconditional create violating the partial unique index.
    const club = await mkClub();
    const user = await loginAsStudent(app);
    await prisma.clubMembership.create({ data: { clubId: club.id, userId: user.userId, status: 'ACTIVE' } });
    const appt = await inviteOfficer(club.id, user.userId, 'CTO');

    expect(
      (
        await request(app.getHttpServer())
          .post(`${API_PREFIX}/appointments/${appt.id}/accept`)
          .set('Cookie', user.sessionCookie)
      ).status,
    ).toBe(201);
    expect(await prisma.clubMembership.count({ where: { clubId: club.id, userId: user.userId } })).toBe(1);
  });

  it('activates a PENDING membership rather than creating a duplicate', async () => {
    // An existing open, not-yet-ACTIVE row is decided rather than duplicated.
    const club = await mkClub();
    const user = await loginAsStudent(app);
    const pending = await prisma.clubMembership.create({
      data: { clubId: club.id, userId: user.userId, status: 'PENDING' },
    });
    const appt = await inviteOfficer(club.id, user.userId, 'CTO');

    expect(
      (
        await request(app.getHttpServer())
          .post(`${API_PREFIX}/appointments/${appt.id}/accept`)
          .set('Cookie', user.sessionCookie)
      ).status,
    ).toBe(201);

    const membership = await prisma.clubMembership.findUniqueOrThrow({ where: { id: pending.id } });
    expect(membership.status).toBe('ACTIVE');
    expect(membership.decidedById).toBe(user.userId);
    expect(await prisma.clubMembership.count({ where: { clubId: club.id, userId: user.userId } })).toBe(1);
  });

  it('refuses acceptance by anyone other than the invitee, with 404', async () => {
    // 404, not 403, so the endpoint does not confirm the id exists.
    const club = await mkClub();
    const invitee = await loginAsStudent(app);
    const stranger = await loginAsStudent(app);
    const appt = await inviteOfficer(club.id, invitee.userId, 'CTO');

    expect(
      (
        await request(app.getHttpServer())
          .post(`${API_PREFIX}/appointments/${appt.id}/accept`)
          .set('Cookie', stranger.sessionCookie)
      ).status,
    ).toBe(404);
    expect((await prisma.clubTeamAppointment.findUniqueOrThrow({ where: { id: appt.id } })).status).toBe('INVITED');
  });

  it('refuses an expired invitation, marks it EXPIRED, and the flip survives the failed request', async () => {
    // Catches throwing inside the host.run that wrote EXPIRED, which rolls the write back.
    const club = await mkClub();
    const user = await loginAsStudent(app);
    const appt = await inviteOfficer(club.id, user.userId, 'CTO');
    await prisma.clubTeamAppointment.update({
      where: { id: appt.id },
      data: { invitationExpiresAt: new Date(Date.now() - 1000) },
    });

    expect(
      (
        await request(app.getHttpServer())
          .post(`${API_PREFIX}/appointments/${appt.id}/accept`)
          .set('Cookie', user.sessionCookie)
      ).status,
    ).toBe(422);
    expect((await prisma.clubTeamAppointment.findUniqueOrThrow({ where: { id: appt.id } })).status).toBe('EXPIRED');
  });

  it('refuses a second acceptance of the same invitation', async () => {
    const club = await mkClub();
    const user = await loginAsStudent(app);
    const appt = await inviteOfficer(club.id, user.userId, 'CTO');
    const accept = () =>
      request(app.getHttpServer()).post(`${API_PREFIX}/appointments/${appt.id}/accept`).set('Cookie', user.sessionCookie);

    expect((await accept()).status).toBe(201);
    const second = await accept();
    expect(second.status).toBe(422);
    expect((await prisma.clubTeamAppointment.findUniqueOrThrow({ where: { id: appt.id } })).status).toBe('ACTIVE');
  });

  it('refuses acceptance for an archived club, leaving the invitation open', async () => {
    // Reaches assertAcceptsEdits: not expired, not decided, club not accepting edits.
    const club = await mkClub();
    const user = await loginAsStudent(app);
    const appt = await inviteOfficer(club.id, user.userId, 'CTO');
    await prisma.club.update({ where: { id: club.id }, data: { status: 'ARCHIVED' } });

    expect(
      (
        await request(app.getHttpServer())
          .post(`${API_PREFIX}/appointments/${appt.id}/accept`)
          .set('Cookie', user.sessionCookie)
      ).status,
    ).toBe(422);
    expect((await prisma.clubTeamAppointment.findUniqueOrThrow({ where: { id: appt.id } })).status).toBe('INVITED');
  });
});

describe('POST /appointments/:appointmentId/decline', () => {
  it('declines without creating a membership', async () => {
    const club = await mkClub();
    const user = await loginAsStudent(app);
    const appt = await inviteOfficer(club.id, user.userId, 'CTO');

    expect(
      (
        await request(app.getHttpServer())
          .post(`${API_PREFIX}/appointments/${appt.id}/decline`)
          .set('Cookie', user.sessionCookie)
      ).status,
    ).toBe(201);

    expect((await prisma.clubTeamAppointment.findUniqueOrThrow({ where: { id: appt.id } })).status).toBe('DECLINED');
    expect(await prisma.clubMembership.count({ where: { clubId: club.id, userId: user.userId } })).toBe(0);
  });

  it('refuses decline by anyone other than the invitee, with 404', async () => {
    const club = await mkClub();
    const invitee = await loginAsStudent(app);
    const stranger = await loginAsStudent(app);
    const appt = await inviteOfficer(club.id, invitee.userId, 'CTO');

    expect(
      (
        await request(app.getHttpServer())
          .post(`${API_PREFIX}/appointments/${appt.id}/decline`)
          .set('Cookie', stranger.sessionCookie)
      ).status,
    ).toBe(404);
    expect((await prisma.clubTeamAppointment.findUniqueOrThrow({ where: { id: appt.id } })).status).toBe('INVITED');
  });

  it('refuses an expired invitation and the EXPIRED flip survives the failed request', async () => {
    const club = await mkClub();
    const user = await loginAsStudent(app);
    const appt = await inviteOfficer(club.id, user.userId, 'CTO');
    await prisma.clubTeamAppointment.update({
      where: { id: appt.id },
      data: { invitationExpiresAt: new Date(Date.now() - 1000) },
    });

    expect(
      (
        await request(app.getHttpServer())
          .post(`${API_PREFIX}/appointments/${appt.id}/decline`)
          .set('Cookie', user.sessionCookie)
      ).status,
    ).toBe(422);
    expect((await prisma.clubTeamAppointment.findUniqueOrThrow({ where: { id: appt.id } })).status).toBe('EXPIRED');
  });

  it('refuses a second decline of the same invitation', async () => {
    const club = await mkClub();
    const user = await loginAsStudent(app);
    const appt = await inviteOfficer(club.id, user.userId, 'CTO');
    const decline = () =>
      request(app.getHttpServer())
        .post(`${API_PREFIX}/appointments/${appt.id}/decline`)
        .set('Cookie', user.sessionCookie);

    expect((await decline()).status).toBe(201);
    expect((await decline()).status).toBe(422);
    expect((await prisma.clubTeamAppointment.findUniqueOrThrow({ where: { id: appt.id } })).status).toBe('DECLINED');
  });
});

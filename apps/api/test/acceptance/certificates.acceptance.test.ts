import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { API_PREFIX } from '../../src/config/api-prefix';
import { createTestApp } from '../app';
import { loginAsAdmin, loginAsStudent } from '../auth-helpers';
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

const verify = (code: string) => request(app.getHttpServer()).get(`${API_PREFIX}/verify/${code}`);

/** A finished event with one attendee, certificates issued. */
async function anIssuedCertificate() {
  const ended = Date.now() - HOUR;
  const club = await mkClub();
  const lead = await makeActiveLead(app, club.id);
  const event = await mkEvent(club.id, lead.userId, {
    status: 'COMPLETED',
    certificateEnabled: true,
    certificateTitle: 'Certificate of Participation',
    certificateSignatory: 'Dr A Person',
    startsAt: new Date(ended - 2 * HOUR),
    endsAt: new Date(ended),
    registrationOpensAt: new Date(ended - 30 * DAY),
    registrationClosesAt: new Date(ended - 3 * HOUR),
    confirmedCount: 1,
  });
  const attendee = await loginAsStudent(app, { fullName: 'Amina Hassan' });
  const registration = await mkRegistration(event.id, attendee.userId, 'CHECKED_IN');
  await prisma.attendanceRecord.create({
    data: {
      registrationId: registration.id,
      eventId: event.id,
      userId: attendee.userId,
      checkedInById: lead.userId,
      method: 'MANUAL',
    },
  });
  await request(app.getHttpServer())
    .post(`${API_PREFIX}/events/${event.id}/certificates/issue`)
    .set('Cookie', lead.sessionCookie)
    .expect(200);
  const certificate = await prisma.certificate.findFirstOrThrow({ where: { eventId: event.id } });
  return { certificate, attendee, event };
}

describe('GET /verify/:code', () => {
  it('confirms an issued certificate to anyone, signed in or not', async () => {
    const { certificate, event } = await anIssuedCertificate();

    const res = await verify(certificate.verificationCode).expect(200);

    expect(res.body.status).toBe('ACTIVE');
    expect(res.body.holderName).toBe('Amina Hassan');
    expect(res.body.eventTitle).toBe(event.title);
  });

  it('discloses no email, user id or serial number', async () => {
    const { certificate, attendee } = await anIssuedCertificate();
    const { email } = await prisma.user.findUniqueOrThrow({ where: { id: attendee.userId } });

    const body = JSON.stringify((await verify(certificate.verificationCode).expect(200)).body);

    expect(body).not.toContain(email);
    expect(body).not.toContain(attendee.userId);
    expect(body).not.toContain(certificate.serialNumber);
  });

  it('answers an unknown code with 404', async () => {
    await verify('ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ').expect(404);
  });

  it('reports a revoked certificate as REVOKED rather than hiding it', async () => {
    const { certificate } = await anIssuedCertificate();
    const admin = await loginAsAdmin(app);
    await request(app.getHttpServer())
      .post(`${API_PREFIX}/certificates/${certificate.id}/revoke`)
      .set('Cookie', admin.sessionCookie)
      .send({ reason: 'Issued in error' })
      .expect(200);

    const res = await verify(certificate.verificationCode).expect(200);

    expect(res.body.status).toBe('REVOKED');
  });
});

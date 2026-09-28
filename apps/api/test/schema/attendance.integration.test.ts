import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { truncateAll } from '../db';
import { anEvent, at, mkClub, mkUser, testDb, uniq } from '../factories';

const prisma = testDb();

afterAll(async () => { await prisma.$disconnect(); });
beforeEach(async () => { await truncateAll(prisma); });

async function aRegistration() {
  const club = await mkClub();
  const creator = await mkUser();
  // `status` dropped to keep the schema's DRAFT default.
  const { status: _status, ...data } = anEvent(club.id, creator.id, {
    startsAt: at(24),
    endsAt: at(26),
    registrationOpensAt: at(1),
    registrationClosesAt: at(23),
    capacity: 10,
    certificateEnabled: true,
  });
  const event = await prisma.event.create({ data });
  const user = await mkUser();
  const registration = await prisma.eventRegistration.create({
    data: { eventId: event.id, userId: user.id, status: 'CONFIRMED' },
  });
  return { club, event, user, registration };
}

describe('AttendanceRecord', () => {
  it('records a check-in with who recorded it and the method', async () => {
    const { event, user, registration } = await aRegistration();
    const operator = await mkUser();
    const record = await prisma.attendanceRecord.create({
      data: {
        registrationId: registration.id,
        eventId: event.id,
        userId: user.id,
        checkedInById: operator.id,
        method: 'MANUAL',
      },
    });
    expect(record.method).toBe('MANUAL');
    expect(record.checkedInAt).toBeInstanceOf(Date);
  });

  it('scopes attendance per registration, not per event: a queue of students all check in', async () => {
    // Catches a unique index on event_id instead of registration_id.
    const { event, user, registration } = await aRegistration();
    const operator = await mkUser();
    await prisma.attendanceRecord.create({
      data: { registrationId: registration.id, eventId: event.id, userId: user.id, checkedInById: operator.id, method: 'MANUAL' },
    });

    const second = await mkUser();
    const secondReg = await prisma.eventRegistration.create({
      data: { eventId: event.id, userId: second.id, status: 'CONFIRMED' },
    });

    await expect(
      prisma.attendanceRecord.create({
        data: { registrationId: secondReg.id, eventId: event.id, userId: second.id, checkedInById: operator.id, method: 'MANUAL' },
      }),
    ).resolves.toBeDefined();
  });

  it('scopes attendance per registration, not per user: one student attends two events', async () => {
    // The mirror: catches a unique index on user_id.
    const first = await aRegistration();
    const operator = await mkUser();
    await prisma.attendanceRecord.create({
      data: {
        registrationId: first.registration.id,
        eventId: first.event.id,
        userId: first.user.id,
        checkedInById: operator.id,
        method: 'MANUAL',
      },
    });

    const second = await aRegistration();
    const secondReg = await prisma.eventRegistration.create({
      data: { eventId: second.event.id, userId: first.user.id, status: 'CONFIRMED' },
    });

    await expect(
      prisma.attendanceRecord.create({
        data: {
          registrationId: secondReg.id,
          eventId: second.event.id,
          userId: first.user.id,
          checkedInById: operator.id,
          method: 'MANUAL',
        },
      }),
    ).resolves.toBeDefined();
  });

  it('makes a double check-in impossible, even from two simultaneous operators', async () => {
    const { event, user, registration } = await aRegistration();
    const operator = await mkUser();
    const data = {
      registrationId: registration.id,
      eventId: event.id,
      userId: user.id,
      checkedInById: operator.id,
      method: 'MANUAL' as const,
    };
    await prisma.attendanceRecord.create({ data });
    await expect(prisma.attendanceRecord.create({ data })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('refuses to delete a registration that has an attendance record', async () => {
    // Restrict, not Cascade: deleting would destroy proof of attendance.
    const { user, event, registration } = await aRegistration();
    const operator = await mkUser();
    await prisma.attendanceRecord.create({
      data: { registrationId: registration.id, eventId: event.id, userId: user.id, checkedInById: operator.id, method: 'MANUAL' },
    });

    await expect(
      prisma.eventRegistration.delete({ where: { id: registration.id } }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });
});

describe('Certificate', () => {
  function certData<T extends Record<string, unknown>>(over: T) {
    return {
      serialNumber: uniq('MJL'),
      verificationCode: uniq('VC').replace(/[^A-Z0-9]/gi, '').toUpperCase(),
      holderNameSnapshot: 'Layla Hassan',
      eventTitleSnapshot: 'Workshop',
      clubNameSnapshot: 'Robotics Club',
      clubLogoSnapshotUrl: 'https://example.test/logo.png',
      ...over,
    };
  }

  it('snapshots holder, event, club and logo at issuance', async () => {
    const { event, user, registration } = await aRegistration();
    const cert = await prisma.certificate.create({
      data: certData({ registrationId: registration.id, eventId: event.id, userId: user.id }),
    });
    expect(cert.status).toBe('ACTIVE');
    expect(cert.clubLogoSnapshotUrl).toBe('https://example.test/logo.png');
  });

  it('scopes certificates per registration: two attendees of one event each get one', async () => {
    const { event, user, registration } = await aRegistration();
    await prisma.certificate.create({
      data: certData({ registrationId: registration.id, eventId: event.id, userId: user.id }),
    });

    const second = await mkUser();
    const secondReg = await prisma.eventRegistration.create({
      data: { eventId: event.id, userId: second.id, status: 'CONFIRMED' },
    });

    await expect(
      prisma.certificate.create({
        data: certData({ registrationId: secondReg.id, eventId: event.id, userId: second.id }),
      }),
    ).resolves.toBeDefined();
  });

  it('scopes active certificates per registration, not per student: one student attends two events', async () => {
    // Catches a unique index on user_id; aRegistration() mints a fresh user each call.
    const first = await aRegistration();
    await prisma.certificate.create({
      data: certData({
        registrationId: first.registration.id,
        eventId: first.event.id,
        userId: first.user.id,
      }),
    });

    const second = await aRegistration();
    const secondReg = await prisma.eventRegistration.create({
      data: { eventId: second.event.id, userId: first.user.id, status: 'CONFIRMED' },
    });

    await expect(
      prisma.certificate.create({
        data: certData({
          registrationId: secondReg.id,
          eventId: second.event.id,
          userId: first.user.id,
        }),
      }),
    ).resolves.toBeDefined();
  });

  it('rejects a second ACTIVE certificate for one registration, so re-running issuance is safe', async () => {
    const { event, user, registration } = await aRegistration();
    const base = { registrationId: registration.id, eventId: event.id, userId: user.id };
    await prisma.certificate.create({ data: certData(base) });
    await expect(prisma.certificate.create({ data: certData(base) }))
      .rejects.toMatchObject({ code: 'P2002' });
  });

  it('allows a new ACTIVE certificate once the previous one is REVOKED, keeping both', async () => {
    const { event, user, registration } = await aRegistration();
    const base = { registrationId: registration.id, eventId: event.id, userId: user.id };
    const first = await prisma.certificate.create({ data: certData(base) });
    await prisma.certificate.update({
      where: { id: first.id },
      data: { status: 'REVOKED', revokedAt: new Date(), revokedReason: 'Name corrected' },
    });
    await expect(prisma.certificate.create({ data: certData(base) })).resolves.toBeDefined();
    expect(await prisma.certificate.count()).toBe(2);
  });

  it('rejects a duplicate serial number', async () => {
    // serial_number is @unique like verification_code, so both need covering.
    const a = await aRegistration();
    const b = await aRegistration();
    const serial = 'MJL-SHARED-0001';

    await prisma.certificate.create({
      data: certData({
        registrationId: a.registration.id,
        eventId: a.event.id,
        userId: a.user.id,
        serialNumber: serial,
      }),
    });

    await expect(
      prisma.certificate.create({
        data: certData({
          registrationId: b.registration.id,
          eventId: b.event.id,
          userId: b.user.id,
          serialNumber: serial,
        }),
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('rejects a duplicate verification code', async () => {
    const a = await aRegistration();
    const b = await aRegistration();
    const code = 'SHAREDCODE123';
    await prisma.certificate.create({
      data: certData({ registrationId: a.registration.id, eventId: a.event.id, userId: a.user.id, verificationCode: code }),
    });
    await expect(
      prisma.certificate.create({
        data: certData({ registrationId: b.registration.id, eventId: b.event.id, userId: b.user.id, verificationCode: code }),
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('refuses to delete a registration that has an active certificate', async () => {
    const { event, user, registration } = await aRegistration();
    await prisma.certificate.create({
      data: certData({ registrationId: registration.id, eventId: event.id, userId: user.id }),
    });

    await expect(
      prisma.eventRegistration.delete({ where: { id: registration.id } }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });
});

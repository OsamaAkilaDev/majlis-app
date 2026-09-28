import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { API_PREFIX } from '../src/config/api-prefix';
import { StorageService } from '../src/storage/storage.service';
import { createTestApp } from './app';
import { loginAsAdmin, loginAsStudent } from './auth-helpers';
import { truncateAll } from './db';
import {
  aDepartment,
  DAY,
  HOUR,
  inviteOfficer,
  makeActiveLead,
  mkClub,
  mkEvent,
  mkUser,
  testDb,
  uniq,
} from './factories';

const in7Days = (plusHours = 0) => new Date(Date.now() + 7 * DAY + plusHours * HOUR);
const daysAgo = (days: number, plusHours = 0) => new Date(Date.now() - days * DAY + plusHours * HOUR);

const CLUBS_PATH = `${API_PREFIX}/clubs`;
const UPLOAD_PATH = `${API_PREFIX}/uploads/club-logo`;

const prisma = testDb();
let app: INestApplication;

const uploaded = new Map<string, { size: number; contentType: string }>();

// Stubbed at the module level so no test in this file touches Supabase.
const fakeStorage = {
  createSignedUploadUrl: async (path: string) => ({
    signedUrl: `https://example.supabase.co/storage/v1/object/upload/sign/majlis-storage/${path}?token=t`,
    token: 't',
  }),
  statObject: async (path: string) => uploaded.get(path) ?? null,
  publicUrlFor: (path: string, version: number) =>
    `https://example.supabase.co/storage/v1/object/public/majlis-storage/${path}?v=${version}`,
};

beforeAll(async () => {
  app = await createTestApp([], [{ provide: StorageService, useValue: fakeStorage }]);
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await truncateAll(prisma);
  uploaded.clear();
});

/** Every test mints clubId first. No logoUrl: the server derives it. */
function validBody(departmentId: string) {
  return {
    departmentId,
    name: uniq('Club'),
    description: 'We build robots.',
    category: 'Technology',
    academicYear: '2026/2027',
    membershipPolicy: 'OPEN' as const,
  };
}

describe('POST /uploads/club-logo then POST /clubs', () => {
  it('mints an id, then creates the club at that id', async () => {
    const admin = await loginAsAdmin(app);
    const dept = await prisma.department.create({ data: aDepartment() });

    const minted = await request(app.getHttpServer()).post(UPLOAD_PATH).set('Cookie', admin.sessionCookie);
    expect(minted.status).toBe(201);

    const { clubId, path } = minted.body;
    expect(path).toBe(`clubs/${clubId}/logo.webp`);
    uploaded.set(path, { size: 1000, contentType: 'image/webp' });

    const res = await request(app.getHttpServer())
      .post(CLUBS_PATH)
      .set('Cookie', admin.sessionCookie)
      .send({ ...validBody(dept.id), name: 'Robotics Club', clubId });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(clubId);
    expect(res.body.slug).toBe('robotics-club');
  });

  it('refuses to create a club whose logo was never uploaded', async () => {
    // The API never sees the bytes, so an unverified logo points at nothing.
    const admin = await loginAsAdmin(app);
    const dept = await prisma.department.create({ data: aDepartment() });
    const minted = await request(app.getHttpServer()).post(UPLOAD_PATH).set('Cookie', admin.sessionCookie);
    // `uploaded` is deliberately left empty.

    const res = await request(app.getHttpServer())
      .post(CLUBS_PATH)
      .set('Cookie', admin.sessionCookie)
      .send({ ...validBody(dept.id), clubId: minted.body.clubId });

    expect(res.status).toBe(422);
    expect(await prisma.club.count()).toBe(0);
  });

  it('refuses an uploaded object that is over the kind cap', async () => {
    // Catches verifying existence but not size: 1 MB clears the 2 MB bucket but not the 256 KB cap.
    const admin = await loginAsAdmin(app);
    const dept = await prisma.department.create({ data: aDepartment() });
    const minted = await request(app.getHttpServer()).post(UPLOAD_PATH).set('Cookie', admin.sessionCookie);
    uploaded.set(minted.body.path, { size: 1_000_000, contentType: 'image/webp' });

    const res = await request(app.getHttpServer())
      .post(CLUBS_PATH)
      .set('Cookie', admin.sessionCookie)
      .send({ ...validBody(dept.id), clubId: minted.body.clubId });

    expect(res.status).toBe(422);
    expect(await prisma.club.count()).toBe(0);
  });

  it('refuses an uploaded object that is not WebP', async () => {
    const admin = await loginAsAdmin(app);
    const dept = await prisma.department.create({ data: aDepartment() });
    const minted = await request(app.getHttpServer()).post(UPLOAD_PATH).set('Cookie', admin.sessionCookie);
    uploaded.set(minted.body.path, { size: 1000, contentType: 'image/png' });

    const res = await request(app.getHttpServer())
      .post(CLUBS_PATH)
      .set('Cookie', admin.sessionCookie)
      .send({ ...validBody(dept.id), clubId: minted.body.clubId });

    expect(res.status).toBe(422);
    expect(await prisma.club.count()).toBe(0);
  });

  it('suffixes the slug when two clubs share a name', async () => {
    const admin = await loginAsAdmin(app);
    const dept = await prisma.department.create({ data: aDepartment() });
    const create = async (name: string) => {
      const minted = await request(app.getHttpServer()).post(UPLOAD_PATH).set('Cookie', admin.sessionCookie);
      uploaded.set(minted.body.path, { size: 1000, contentType: 'image/webp' });
      return request(app.getHttpServer())
        .post(CLUBS_PATH)
        .set('Cookie', admin.sessionCookie)
        .send({ ...validBody(dept.id), name, clubId: minted.body.clubId });
    };

    expect((await create('Robotics Club')).body.slug).toBe('robotics-club');
    // uniqueSlug already moved the slug to -2, so only the unique name can fail.
    const collision = await create('Robotics Club');
    expect(collision.status).toBe(409);
    // The filter maps any P2002 to 409, so the detail proves mapWriteError picked the name branch.
    expect(collision.body.detail).toBe('A club with that name already exists.');
    expect((await create('Robotics  Club!')).body.slug).toBe('robotics-club-2');
  });

  it('refuses a STUDENT', async () => {
    const student = await loginAsStudent(app);
    expect(
      (await request(app.getHttpServer()).post(UPLOAD_PATH).set('Cookie', student.sessionCookie)).status,
    ).toBe(403);
  });

  it('refuses a STUDENT on POST /clubs itself, and no club is created', async () => {
    // Catches the guard missing from `create` itself.
    const student = await loginAsStudent(app);
    const dept = await prisma.department.create({ data: aDepartment() });

    const res = await request(app.getHttpServer())
      .post(CLUBS_PATH)
      .set('Cookie', student.sessionCookie)
      .send({ ...validBody(dept.id), clubId: '01936c7e-0000-7000-8000-000000000099' });

    expect(res.status).toBe(403);
    expect(await prisma.club.count()).toBe(0);
  });
});

describe('GET /clubs', () => {
  it('filters by status for an Admin, holding department constant', async () => {
    // The fixtures differ only in status, so ignoring `status` fails.
    const admin = await loginAsAdmin(app);
    const dept = await prisma.department.create({ data: aDepartment() });
    const archived = await mkClub({ departmentId: dept.id, status: 'ARCHIVED' });
    await mkClub({ departmentId: dept.id });

    const res = await request(app.getHttpServer())
      .get(`${CLUBS_PATH}?status=ARCHIVED`)
      .set('Cookie', admin.sessionCookie);

    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].id).toBe(archived.id);
  });

  it('gives a student ACTIVE clubs only, whatever status they ask for', async () => {
    // Catches the status filter being the only thing hiding a suspended club.
    const student = await loginAsStudent(app);
    const dept = await prisma.department.create({ data: aDepartment() });
    await mkClub({ departmentId: dept.id, status: 'SUSPENDED' });
    const active = await mkClub({ departmentId: dept.id });

    const res = await request(app.getHttpServer())
      .get(`${CLUBS_PATH}?status=SUSPENDED`)
      .set('Cookie', student.sessionCookie);

    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].id).toBe(active.id);
  });

  it('joinable hides the clubs the viewer is in or waiting on, and nothing else', async () => {
    // Each status asserted alone: a viewer who LEFT can re-join, and a stranger's membership must not count.
    const viewer = await loginAsStudent(app);
    const stranger = await loginAsStudent(app);

    const active = await mkClub({ name: uniq('Active Club') });
    const pending = await mkClub({ name: uniq('Pending Club') });
    const left = await mkClub({ name: uniq('Left Club') });
    const untouched = await mkClub({ name: uniq('Untouched Club') });

    await prisma.clubMembership.create({ data: { clubId: active.id, userId: viewer.userId, status: 'ACTIVE' } });
    await prisma.clubMembership.create({ data: { clubId: pending.id, userId: viewer.userId, status: 'PENDING' } });
    await prisma.clubMembership.create({ data: { clubId: left.id, userId: viewer.userId, status: 'LEFT' } });
    await prisma.clubMembership.create({ data: { clubId: untouched.id, userId: stranger.userId, status: 'ACTIVE' } });

    const names = (res: request.Response) => (res.body.items as { name: string }[]).map((c) => c.name);

    const all = await request(app.getHttpServer())
      .get(`${CLUBS_PATH}?status=ACTIVE`)
      .set('Cookie', viewer.sessionCookie);
    expect(names(all)).toEqual(
      expect.arrayContaining([active.name, pending.name, left.name, untouched.name]),
    );

    const joinable = await request(app.getHttpServer())
      .get(`${CLUBS_PATH}?status=ACTIVE&joinable=true`)
      .set('Cookie', viewer.sessionCookie);
    expect(names(joinable)).toEqual(expect.arrayContaining([left.name, untouched.name]));
    expect(names(joinable)).not.toContain(active.name);
    expect(names(joinable)).not.toContain(pending.name);
  });

  it('reports the viewer relationship on the summary, per viewer', async () => {
    // Two viewers, one club, opposite answers.
    const owner = await loginAsStudent(app);
    const stranger = await loginAsStudent(app);
    const club = await mkClub({ name: uniq('One Club') });
    await prisma.clubMembership.create({ data: { clubId: club.id, userId: owner.userId, status: 'ACTIVE' } });

    const mine = await request(app.getHttpServer())
      .get(`${CLUBS_PATH}?status=ACTIVE&q=${encodeURIComponent(club.name)}`)
      .set('Cookie', owner.sessionCookie);
    expect(mine.body.items[0].viewerJoined).toBe(true);

    const theirs = await request(app.getHttpServer())
      .get(`${CLUBS_PATH}?status=ACTIVE&q=${encodeURIComponent(club.name)}`)
      .set('Cookie', stranger.sessionCookie);
    expect(theirs.body.items[0].viewerJoined).toBe(false);
  });
});

describe('GET /clubs/:clubId', () => {
  it('reports the viewer own membership status and roles, never another user', async () => {
    const student = await loginAsStudent(app);
    const other = await loginAsStudent(app);
    const club = await mkClub();
    await prisma.clubMembership.create({
      data: { clubId: club.id, userId: other.userId, status: 'ACTIVE' },
    });

    const res = await request(app.getHttpServer())
      .get(`${CLUBS_PATH}/${club.id}`)
      .set('Cookie', student.sessionCookie);

    // Catches a findFirst with no userId filter.
    expect(res.body.viewerMembershipStatus).toBeNull();
    expect(res.body.memberCount).toBe(1);
  });

  it('counts only events the club has actually run', async () => {
    // Counting every status gives 6, and counting stored status alone gives 1.
    const lead = await loginAsStudent(app);
    const club = await mkClub();
    await mkEvent(club.id, lead.userId, { startsAt: in7Days(), endsAt: in7Days(2) });
    await mkEvent(club.id, lead.userId, { status: 'DRAFT', startsAt: in7Days(), endsAt: in7Days(2) });
    const past = {
      startsAt: daysAgo(9),
      endsAt: daysAgo(9, 2),
      registrationOpensAt: daysAgo(12),
      registrationClosesAt: daysAgo(10),
    };
    await mkEvent(club.id, lead.userId, { status: 'COMPLETED', ...past });
    // Ended but never opened since, so still stored PUBLISHED: counting stored status alone misses it.
    await mkEvent(club.id, lead.userId, { status: 'PUBLISHED', ...past });
    await mkEvent(club.id, lead.userId, { status: 'DRAFT', ...past });
    await mkEvent(club.id, lead.userId, { status: 'CANCELLED', cancelledReason: 'Venue withdrawn', ...past });

    const res = await request(app.getHttpServer())
      .get(`${CLUBS_PATH}/${club.id}`)
      .set('Cookie', lead.sessionCookie);

    expect(res.body.eventsRun).toBe(2);
  });

  describe('pendingMemberCount', () => {
    it('is null for an ordinary active member', async () => {
      // An ordinary member, since a stranger alone passes a gate on membership rather than membership:decide.
      const club = await mkClub();
      const lead = await makeActiveLead(app, club.id);
      const member = await loginAsStudent(app);
      const stranger = await loginAsAdmin(app);
      await prisma.clubMembership.create({
        data: { clubId: club.id, userId: member.userId, status: 'ACTIVE' },
      });
      await prisma.clubMembership.create({
        data: { clubId: club.id, userId: (await mkUser()).id, status: 'PENDING' },
      });

      const asLead = await request(app.getHttpServer())
        .get(`${CLUBS_PATH}/${club.id}`)
        .set('Cookie', lead.sessionCookie);
      expect(asLead.body.pendingMemberCount).toBe(1);

      const asMember = await request(app.getHttpServer())
        .get(`${CLUBS_PATH}/${club.id}`)
        .set('Cookie', member.sessionCookie);
      expect(asMember.body.pendingMemberCount).toBeNull();

      const asAdmin = await request(app.getHttpServer())
        .get(`${CLUBS_PATH}/${club.id}`)
        .set('Cookie', stranger.sessionCookie);
      expect(asAdmin.body.pendingMemberCount).toBe(1);
    });
  });

  it('carries the committee, active appointments only', async () => {
    // Catches listing unaccepted invitations on the club page.
    const student = await loginAsStudent(app);
    const club = await mkClub();
    const lead = await makeActiveLead(app, club.id);
    const pending = await mkUser();
    await inviteOfficer(club.id, pending.id, 'CTO');

    const res = await request(app.getHttpServer())
      .get(`${CLUBS_PATH}/${club.id}`)
      .set('Cookie', student.sessionCookie);

    expect(res.body.committee).toHaveLength(1);
    expect(res.body.committee[0].userId).toBe(lead.userId);
    expect(res.body.committee[0].role).toBe('LEAD');
    // An address is directory data; the club page is open to every signed-in user.
    expect(res.body.committee[0]).not.toHaveProperty('userEmail');
  });

  it('returns 404 for a well-formed but unknown id', async () => {
    const student = await loginAsStudent(app);
    const res = await request(app.getHttpServer())
      .get(`${CLUBS_PATH}/00000000-0000-7000-8000-000000000000`)
      .set('Cookie', student.sessionCookie);

    expect(res.status).toBe(404);
  });
});

describe('GET /clubs/by-slug/:slug', () => {
  it('resolves the same club the id route does', async () => {
    const student = await loginAsStudent(app);
    const club = await mkClub();

    const res = await request(app.getHttpServer())
      .get(`${CLUBS_PATH}/by-slug/${club.slug}`)
      .set('Cookie', student.sessionCookie);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(club.id);
  });

  it('reports the viewer own membership, not another user', async () => {
    const student = await loginAsStudent(app);
    const other = await loginAsStudent(app);
    const club = await mkClub();
    await prisma.clubMembership.create({
      data: { clubId: club.id, userId: other.userId, status: 'ACTIVE' },
    });

    const res = await request(app.getHttpServer())
      .get(`${CLUBS_PATH}/by-slug/${club.slug}`)
      .set('Cookie', student.sessionCookie);

    expect(res.body.viewerMembershipStatus).toBeNull();
  });

  it('is 404 on a suspended club for a student holding its slug', async () => {
    // The slug is public but the club is not.
    const student = await loginAsStudent(app);
    const club = await mkClub({ status: 'SUSPENDED' });

    const res = await request(app.getHttpServer())
      .get(`${CLUBS_PATH}/by-slug/${club.slug}`)
      .set('Cookie', student.sessionCookie);

    expect(res.status).toBe(404);
  });

  it('still opens that club for one of its own active officers', async () => {
    // Paired with the above: a gate refusing everybody locks officers out.
    const club = await mkClub({ status: 'SUSPENDED' });
    const lead = await makeActiveLead(app, club.id);

    const res = await request(app.getHttpServer())
      .get(`${CLUBS_PATH}/by-slug/${club.slug}`)
      .set('Cookie', lead.sessionCookie);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(club.id);
  });

  it('still opens that club for an Admin', async () => {
    const admin = await loginAsAdmin(app);
    const club = await mkClub({ status: 'ARCHIVED' });

    const res = await request(app.getHttpServer())
      .get(`${CLUBS_PATH}/by-slug/${club.slug}`)
      .set('Cookie', admin.sessionCookie);

    expect(res.status).toBe(200);
  });

  it('returns 404 for an unknown slug', async () => {
    const student = await loginAsStudent(app);
    expect(
      (await request(app.getHttpServer())
        .get(`${CLUBS_PATH}/by-slug/no-such-club`)
        .set('Cookie', student.sessionCookie)).status,
    ).toBe(404);
  });
});

describe('PATCH /clubs/:clubId, admin override', () => {
  // Catches overrideReasonFor making every Admin PATCH a 422.
  it('refuses a club-roleless admin with no reason and records one when given', async () => {
    const club = await mkClub();
    const admin = await loginAsAdmin(app);

    const patch = (body: object) =>
      request(app.getHttpServer())
        .patch(`${CLUBS_PATH}/${club.id}`)
        .set('Cookie', admin.sessionCookie)
        .send(body);

    const bare = await patch({ category: 'Robotics' });
    expect(bare.status).toBe(422);
    expect(bare.body.detail).toBe('An admin override requires a reason.');
    expect((await prisma.club.findUniqueOrThrow({ where: { id: club.id } })).category).toBe(
      club.category,
    );

    const withReason = await patch({ category: 'Robotics', overrideReason: 'Miscategorised.' });
    expect(withReason.status).toBe(200);
    expect((await prisma.club.findUniqueOrThrow({ where: { id: club.id } })).category).toBe('Robotics');

    const row = await prisma.auditLog.findFirst({
      where: { action: 'club.updated', entityId: club.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(row?.reason).toBe('Miscategorised.');
  });
});

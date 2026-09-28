import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SESSION_COOKIE } from '../src/auth/cookies';
import { API_PREFIX } from '../src/config/api-prefix';
import type {
  AppointmentStatus,
  Club,
  ClubRole,
  ClubTeamAppointment,
  Event,
  EventRegistration,
  Prisma,
  RegistrationStatus,
  User,
} from '../src/generated/prisma/client';
import { createTestPrisma } from './db';

export type UserSeed = Prisma.UserCreateInput;
export type ClubSeed = Prisma.ClubUncheckedCreateInput;
export type DepartmentSeed = Prisma.DepartmentCreateInput;

export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;
export const at = (hours: number) => new Date(Date.now() + hours * HOUR);

/** A fixed string collides within a test and reads like a bug in the code under test. */
export function uniq(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

/** Lowercased because of CHECK (email = lower(email)). */
export function aUser(overrides: Partial<UserSeed> = {}): UserSeed {
  const handle = uniq('user');
  return {
    email: `${handle}@uni.ac.ae`.toLowerCase(),
    password: 'not-a-real-password-tests-that-log-in-must-set-this',
    fullName: 'Test Person',
    ...overrides,
  };
}

export function aDepartment(overrides: Partial<DepartmentSeed> = {}): DepartmentSeed {
  const handle = uniq('dept');
  return {
    name: `Department ${handle}`,
    code: handle.toUpperCase(),
    ...overrides,
  };
}

export function aClub(departmentId: string, overrides: Partial<ClubSeed> = {}): ClubSeed {
  const handle = uniq('club');
  return {
    departmentId,
    name: `Club ${handle}`,
    slug: `club-${handle}`,
    description: 'A club.',
    category: 'Technology',
    academicYear: '2026/2027',
    logoUrl: 'https://example.test/logo.png',
    ...overrides,
  };
}

// One module instance per test file under forks with isolate, so one client; afterAll disconnects it.
let db: ReturnType<typeof createTestPrisma> | undefined;
export function testDb() {
  db ??= createTestPrisma();
  return db;
}

export function mkUser(overrides: Partial<UserSeed> = {}): Promise<User> {
  return testDb().user.create({ data: aUser(overrides) });
}

/** Creates its Department unless `departmentId` is given. */
export async function mkClub(overrides: Partial<ClubSeed> = {}): Promise<Club> {
  const departmentId =
    overrides.departmentId ?? (await testDb().department.create({ data: aDepartment() })).id;
  return testDb().club.create({ data: aClub(departmentId, overrides) });
}

export interface AppointmentSeed {
  userId: string;
  clubId: string;
  role: ClubRole;
  status: AppointmentStatus;
}

/** `status` has no default, so a permission test must state it. */
export function mkAppointment({
  userId,
  clubId,
  role,
  status,
}: AppointmentSeed): Promise<ClubTeamAppointment> {
  return testDb().clubTeamAppointment.create({
    data: { userId, clubId, role, status, invitedById: userId },
  });
}

/** Matches what TeamService.invite produces, without an authenticated Lead. */
export function inviteOfficer(clubId: string, userId: string, role: ClubRole): Promise<ClubTeamAppointment> {
  return testDb().clubTeamAppointment.create({
    data: {
      clubId,
      userId,
      role,
      status: 'INVITED',
      invitedById: userId,
      invitationExpiresAt: new Date(Date.now() + 14 * DAY),
    },
  });
}

export interface ActiveLead {
  userId: string;
  sessionCookie: string;
  appointmentId: string;
}

/** Duplicates loginAsStudent on purpose: auth-helpers imports `uniq` from here, so reusing it is a cycle. */
async function signupForAppointment(
  app: INestApplication,
  emailPrefix: string,
  fullName: string,
): Promise<{ userId: string; sessionCookie: string }> {
  const res = await request(app.getHttpServer())
    .post(`${API_PREFIX}/auth/signup`)
    .send({ email: `${uniq(emailPrefix)}@uni.ac.ae`, password: 'correct-horse-battery', fullName });
  if (res.status !== 201) {
    throw new Error(`signupForAppointment: signup failed with ${res.status}: ${JSON.stringify(res.body)}`);
  }
  const userId = (res.body as { id: string }).id;
  const setCookie = res.headers['set-cookie'] as unknown as string[];
  const sessionCookie = setCookie.find((c) => c.startsWith(`${SESSION_COOKIE}=`))!.split(';')[0]!;
  return { userId, sessionCookie };
}

export async function makeActiveLead(app: INestApplication, clubId: string): Promise<ActiveLead> {
  const { userId, sessionCookie } = await signupForAppointment(app, 'lead', 'Test Lead');
  const appointment = await mkAppointment({ userId, clubId, role: 'LEAD', status: 'ACTIVE' });
  return { userId, sessionCookie, appointmentId: appointment.id };
}

export async function makeActiveOfficer(
  app: INestApplication,
  clubId: string,
  role: ClubRole,
): Promise<ActiveLead> {
  const { userId, sessionCookie } = await signupForAppointment(app, 'officer', 'Test Officer');
  const appointment = await mkAppointment({ userId, clubId, role, status: 'ACTIVE' });
  return { userId, sessionCookie, appointmentId: appointment.id };
}

export type EventSeed = Prisma.EventUncheckedCreateInput;
export type RegistrationSeed = Prisma.EventRegistrationUncheckedCreateInput;

/** A consistent schedule. Defaults to PUBLISHED so tests do not silently hit the invisible DRAFT case. */
export function anEvent(clubId: string, createdById: string, overrides: Partial<EventSeed> = {}): EventSeed {
  const handle = uniq('event');
  const now = Date.now();
  return {
    clubId,
    createdById,
    title: `Event ${handle}`,
    slug: `event-${handle}`,
    summary: 'An event.',
    description: 'Something happens.',
    eventType: 'Workshop',
    audience: 'All students',
    venue: 'Hall A',
    startsAt: new Date(now + 7 * DAY),
    endsAt: new Date(now + 7 * DAY + 2 * HOUR),
    registrationOpensAt: new Date(now - DAY),
    registrationClosesAt: new Date(now + 6 * DAY),
    capacity: 30,
    status: 'PUBLISHED',
    ...overrides,
  };
}

export function mkEvent(
  clubId: string,
  createdById: string,
  overrides: Partial<EventSeed> = {},
): Promise<Event> {
  return testDb().event.create({ data: anEvent(clubId, createdById, overrides) });
}

/** `status` is required, as in mkAppointment. Does not maintain confirmedCount: the code under test owns it. */
export function mkRegistration(
  eventId: string,
  userId: string,
  status: RegistrationStatus,
  overrides: Partial<RegistrationSeed> = {},
): Promise<EventRegistration> {
  return testDb().eventRegistration.create({ data: { eventId, userId, status, ...overrides } });
}

import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SESSION_COOKIE } from '../src/auth/cookies';
import { API_PREFIX } from '../src/config/api-prefix';
import { testDb, uniq } from './factories';

const SIGNUP_PATH = `${API_PREFIX}/auth/signup`;
const LOGIN_PATH = `${API_PREFIX}/auth/login`;
const USER_STATUS_PATH = (id: string) => `${API_PREFIX}/users/${id}/status`;

export interface SignupInput {
  email?: string;
  password?: string;
  fullName?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoggedInUser {
  userId: string;
  /** A `name=value` pair, ready to pass straight to `.set('Cookie', ...)`. */
  sessionCookie: string;
}

export function signup(app: INestApplication, overrides: SignupInput = {}): request.Test {
  return request(app.getHttpServer())
    .post(SIGNUP_PATH)
    .send({
      email: overrides.email ?? `${uniq('user')}@uni.ac.ae`,
      password: overrides.password ?? 'correct-horse-battery',
      fullName: overrides.fullName ?? 'Test Person',
    });
}

export function login(app: INestApplication, credentials: LoginInput): request.Test {
  return request(app.getHttpServer()).post(LOGIN_PATH).send(credentials);
}

function sessionCookieOf(res: request.Response): string {
  const setCookie = res.headers['set-cookie'] as unknown as string[] | undefined;
  const raw = setCookie?.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  if (!raw) throw new Error('Response carried no session cookie: was the request rejected?');
  return raw.split(';')[0]!;
}

/** Signup issues a session, so there is no separate login. */
export async function loginAsStudent(
  app: INestApplication,
  overrides: SignupInput = {},
): Promise<LoggedInUser> {
  const res = await signup(app, overrides);
  if (res.status !== 201) {
    throw new Error(`loginAsStudent: signup failed with ${res.status}: ${JSON.stringify(res.body)}`);
  }
  return { userId: (res.body as { id: string }).id, sessionCookie: sessionCookieOf(res) };
}

/** Promotes with a direct write; the cookie still works because SessionGuard re-reads platformRole. */
export async function loginAsAdmin(
  app: INestApplication,
  overrides: SignupInput = {},
): Promise<LoggedInUser> {
  const student = await loginAsStudent(app, overrides);
  await testDb().user.update({ where: { id: student.userId }, data: { platformRole: 'ADMIN' } });
  return student;
}

/** A session cookie header for an existing user, no signup. */
export async function sessionCookieFor(userId: string): Promise<string> {
  return `${SESSION_COOKIE}=${userId}`;
}

export function patchStatus(
  app: INestApplication,
  cookie: string,
  targetId: string,
  status: 'ACTIVE' | 'SUSPENDED',
  reason: string,
): request.Test {
  return request(app.getHttpServer())
    .patch(USER_STATUS_PATH(targetId))
    .set('Cookie', cookie)
    .send({ status, reason });
}

export async function suspendAsAdmin(
  app: INestApplication,
  targetId: string,
  reason: string,
): Promise<request.Response> {
  const admin = await loginAsAdmin(app);
  return patchStatus(app, admin.sessionCookie, targetId, 'SUSPENDED', reason);
}

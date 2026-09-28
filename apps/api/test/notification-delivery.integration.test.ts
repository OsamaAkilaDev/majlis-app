import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_PREFIX } from '../src/config/api-prefix';
import { EmailChannel } from '../src/notifications/email.channel';
import {
  NOTIFICATION_CHANNEL,
  type DeliverableNotification,
  type DeliveryOutcome,
} from '../src/notifications/notification-channel';
import { NotificationService } from '../src/notifications/notification.service';
import { TransactionHost } from '../src/prisma/transaction.host';
import { createTestApp } from './app';
import { loginAsStudent } from './auth-helpers';
import { truncateAll } from './db';
import { makeActiveLead, mkClub, mkEvent, mkUser, testDb } from './factories';

const prisma = testDb();

/** The real wiring. */
let app: INestApplication;
/** The same app with the channel replaced, so failure is reachable. */
let appWithChannel: INestApplication;

/** Addresses this fake refuses, and how. Set per test. */
const rejects = new Map<string, 'throw' | 'error'>();
const attempted: string[] = [];
/** How long each delivery takes. Set per test. */
let deliveryMs = 0;

const fakeChannel = {
  async deliver(n: DeliverableNotification): Promise<DeliveryOutcome> {
    attempted.push(n.recipientEmail);
    if (deliveryMs > 0) await new Promise((resolve) => setTimeout(resolve, deliveryMs));
    const mode = rejects.get(n.recipientEmail);
    if (mode === 'throw') throw new Error('the mail host hung up');
    if (mode === 'error') return { status: 'FAILED', error: 'that address does not exist' };
    return { status: 'SENT' };
  },
};

beforeAll(async () => {
  app = await createTestApp();
  appWithChannel = await createTestApp([], [{ provide: NOTIFICATION_CHANNEL, useValue: fakeChannel }]);
});

afterAll(async () => {
  await app.close();
  await appWithChannel.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  rejects.clear();
  attempted.length = 0;
  deliveryMs = 0;
  await truncateAll(prisma);
});

async function register(target: INestApplication) {
  const club = await mkClub();
  const lead = await makeActiveLead(target, club.id);
  const event = await mkEvent(club.id, lead.userId);
  const student = await loginAsStudent(target);
  await request(target.getHttpServer())
    .post(`${API_PREFIX}/events/${event.id}/registrations`)
    .set('Cookie', student.sessionCookie)
    .send({})
    .expect(201);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: student.userId } });
  return { email: user.email, userId: user.id };
}

function settled(userId: string) {
  return vi.waitFor(
    async () => {
      const row = await prisma.notification.findFirstOrThrow({ where: { userId } });
      expect(row.emailStatus).not.toBe('PENDING');
      return row;
    },
    { timeout: 10_000, interval: 100 },
  );
}

describe('with the default email channel', () => {
  it('resolves the email channel', () => {
    expect(app.get(NOTIFICATION_CHANNEL)).toBeInstanceOf(EmailChannel);
  });

  it('marks a triggered notification SKIPPED with no error', async () => {
    const { userId } = await register(app);
    const row = await settled(userId);
    expect(row.emailStatus).toBe('SKIPPED');
    expect(row.emailError).toBeNull();
  });
});

describe('delivery after commit', () => {
  it('sends the email a real trigger wrote and records it SENT', async () => {
    const { email, userId } = await register(appWithChannel);
    expect((await settled(userId)).emailStatus).toBe('SENT');
    expect(attempted).toEqual([email]);
  });

  it('answers the request before the email is sent', async () => {
    // Catches delivery awaited inside the request, which makes a bulk cancellation wait on every send.
    deliveryMs = 1500;
    const { userId } = await register(appWithChannel);
    const row = await prisma.notification.findFirstOrThrow({ where: { userId } });
    expect(row.emailStatus).toBe('PENDING');
    expect((await settled(userId)).emailStatus).toBe('SENT');
  });

  it('records a refused address FAILED with the reason', async () => {
    const user = await mkUser();
    rejects.set(user.email, 'error');
    await appWithChannel.get(NotificationService).record({
      userId: user.id,
      type: 'event.published',
      subject: 's1',
      payload: {},
    });

    const row = await settled(user.id);
    expect(row.emailStatus).toBe('FAILED');
    expect(row.emailError).toBe('that address does not exist');
  });

  it('records a channel that throws as FAILED rather than leaving it PENDING', async () => {
    const user = await mkUser();
    rejects.set(user.email, 'throw');
    await appWithChannel.get(NotificationService).record({
      userId: user.id,
      type: 'event.published',
      subject: 's1',
      payload: {},
    });

    const row = await settled(user.id);
    expect(row.emailStatus).toBe('FAILED');
    expect(row.emailError).toBe('the mail host hung up');
  });

  it('sends a deduplicated retry once', async () => {
    // Catches delivery scheduled per entry rather than per row actually inserted.
    const user = await mkUser();
    const service = appWithChannel.get(NotificationService);
    const entry = { userId: user.id, type: 'event.published' as const, subject: 's1', payload: {} };
    await service.record(entry);
    await settled(user.id);
    await service.record(entry);

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(attempted).toEqual([user.email]);
  });

  it('sends nothing when the action rolls back', async () => {
    const user = await mkUser();
    const service = appWithChannel.get(NotificationService);
    const host = appWithChannel.get(TransactionHost);
    await expect(
      host.run(async () => {
        await service.record({ userId: user.id, type: 'event.published', subject: 's1', payload: {} });
        throw new Error('the action failed');
      }),
    ).rejects.toThrow('the action failed');

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(attempted).toEqual([]);
  });
});

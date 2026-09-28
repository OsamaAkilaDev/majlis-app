import type { ConfigService } from '@nestjs/config';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Env } from '../src/config/env.schema';
import { PrismaService } from '../src/prisma/prisma.service';
import { TransactionHost } from '../src/prisma/transaction.host';
import { testDatabaseUrl, truncateAll } from './db';
import { aUser } from './factories';

const config = { get: () => testDatabaseUrl() } as unknown as ConfigService<Env, true>;
const prisma = new PrismaService(config);
const host = new TransactionHost(prisma);

afterAll(async () => { await prisma.$disconnect(); });
beforeEach(async () => { await truncateAll(prisma); });

describe('TransactionHost', () => {
  it('returns the base client when no transaction is running', async () => {
    await host.tx.user.create({ data: aUser({ fullName: 'A' }) });
    expect(await prisma.user.count()).toBe(1);
  });

  it('commits every write made inside run()', async () => {
    await host.run(async () => {
      await host.tx.user.create({ data: aUser({ fullName: 'A' }) });
      await host.tx.user.create({ data: aUser({ fullName: 'B' }) });
    });
    expect(await prisma.user.count()).toBe(2);
  });

  it('rolls back every write when the callback throws', async () => {
    await expect(
      host.run(async () => {
        await host.tx.user.create({ data: aUser({ fullName: 'A' }) });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await prisma.user.count()).toBe(0);
  });

  it('joins the ambient transaction rather than opening a nested one', async () => {
    // Never receives a tx handle, yet must share the outer transaction.
    async function auditWriterDeepInTheStack() {
      await host.tx.auditLog.create({
        data: {
          action: 'user.create',
          entityType: 'User',
          entityId: '00000000-0000-7000-8000-000000000001',
          outcome: 'SUCCESS',
          requestId: 'req-1',
        },
      });
    }

    await expect(
      host.run(async () => {
        await host.tx.user.create({ data: aUser({ fullName: 'A' }) });
        await host.run(auditWriterDeepInTheStack);
        throw new Error('action failed after auditing');
      }),
    ).rejects.toThrow('action failed after auditing');

    // Both the action and its audit row rolled back together.
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.auditLog.count()).toBe(0);
  });

  it('returns the callback result, from both the opening and the joining path', async () => {
    // Catches run() discarding the callback's value on either path.
    expect(await host.run(async () => 'outer')).toBe('outer');

    const joined = await host.run(async () => host.run(async () => 'inner'));
    expect(joined).toBe('inner');
  });

  it('restores the base client once run() resolves', async () => {
    // Proves the AsyncLocalStorage scope does not leak past the callback.
    expect(host.tx).toBe(prisma);

    await host.run(async () => {
      expect(host.tx).not.toBe(prisma);
    });

    expect(host.tx).toBe(prisma);
  });

  it('isolates concurrent transactions from each other', async () => {
    const results = await Promise.allSettled([
      host.run(async () => {
        await host.tx.user.create({ data: aUser({ fullName: 'A' }) });
      }),
      host.run(async () => {
        await host.tx.user.create({ data: aUser({ fullName: 'B' }) });
        throw new Error('second fails');
      }),
    ]);

    expect(results[0]!.status).toBe('fulfilled');
    expect(results[1]!.status).toBe('rejected');
    expect(await prisma.user.count()).toBe(1);
  });
});

describe('TransactionHost.afterCommit', () => {
  it('runs once the outermost transaction commits, on the base client', async () => {
    // Catches a hook run inside the transaction, which would see uncommitted rows through a closing tx.
    const seen: unknown[] = [];

    await host.run(async () => {
      await host.tx.user.create({ data: aUser({ fullName: 'A' }) });
      await host.run(async () => {
        host.afterCommit(() => seen.push(host.tx));
      });
      expect(seen).toHaveLength(0);
    });

    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(prisma);
  });

  it('never runs when the transaction rolls back', async () => {
    let ran = false;
    await expect(
      host.run(async () => {
        host.afterCommit(() => (ran = true));
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(ran).toBe(false);
  });

  it('runs immediately with no transaction open', () => {
    let ran = false;
    host.afterCommit(() => (ran = true));
    expect(ran).toBe(true);
  });
});

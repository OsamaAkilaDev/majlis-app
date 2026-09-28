import type { PrismaClient } from '../src/generated/prisma/client';

type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

/** Fires `request` while `competing` holds the row lock, then commits, so the request decides on a stale read. */
export async function afterCompetingWrite<T>(
  prisma: PrismaClient,
  competing: (tx: Tx) => Promise<unknown>,
  request: () => PromiseLike<T>,
): Promise<T> {
  let commit!: () => void;
  const held = new Promise<void>((resolve) => { commit = resolve; });
  let locked!: () => void;
  const hasLock = new Promise<void>((resolve) => { locked = resolve; });

  const holder = prisma.$transaction(async (tx) => {
    await competing(tx);
    locked();
    await held;
  }, { timeout: 30_000 });

  await hasLock;
  const pending = Promise.resolve(request());

  for (let i = 0; i < 100; i++) {
    const [row] = await prisma.$queryRaw<{ waiting: number }[]>`
      SELECT count(*)::int AS waiting FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock'`;
    if (row && row.waiting > 0) break;
    await new Promise((r) => setTimeout(r, 50));
  }

  commit();
  await holder;
  return pending;
}

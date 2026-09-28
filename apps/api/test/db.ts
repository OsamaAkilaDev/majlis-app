import { PrismaClient } from '../src/generated/prisma/client';
import { pgAdapter } from '../src/prisma/pg-adapter';

/** Resolves the test connection string, refusing anything else. */
export function testDatabaseUrl(): string {
  return assertTestDb(process.env.TEST_DATABASE_URL ?? derive(process.env.DATABASE_URL, 'DATABASE_URL'));
}

/** Unpooled: `prisma migrate` hangs forever through pgBouncer transaction pooling. */
export function testDirectDatabaseUrl(): string {
  return assertTestDb(
    process.env.TEST_DIRECT_URL ??
      process.env.TEST_DATABASE_URL ??
      derive(process.env.DIRECT_URL ?? process.env.DATABASE_URL, 'DIRECT_URL or DATABASE_URL'),
  );
}

/** Parsed, not substring-matched, or a prod URL with a majlis_test user would be truncated. */
function assertTestDb(url: string): string {
  const { pathname } = new URL(url);
  if (pathname !== '/majlis_test') {
    throw new Error(`Refusing to run integration tests against a non-test database: ${url}`);
  }
  return url;
}

// Same server as development, different name. CI overrides with TEST_DATABASE_URL.
function derive(base: string | undefined, name: string): string {
  if (!base) throw new Error(`${name} is not set. Copy .env.example to .env.`);

  const url = new URL(base);
  url.pathname = '/majlis_test';
  return url.toString();
}

export function createTestPrisma(): PrismaClient {
  return new PrismaClient({ adapter: pgAdapter(testDatabaseUrl()) });
}

/** Keeps `_prisma_migrations` so migrations run once per suite. */
export async function truncateAll(prisma: PrismaClient): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;

  if (tables.length === 0) return;

  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { testDirectDatabaseUrl } from './db';

/** Applies all migrations once. `migrate deploy` errors on an empty migrations directory. */
export default function setup(): void {
  // Unpooled: `prisma migrate` through pgBouncer hangs with no error.
  const url = testDirectDatabaseUrl();
  const dir = join(__dirname, '..', 'prisma', 'migrations');

  const hasMigrations =
    existsSync(dir) && readdirSync(dir, { withFileTypes: true }).some((e) => e.isDirectory());

  if (!hasMigrations) return;

  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
  });
}

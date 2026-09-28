import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// One .env at the repo root, usually absent in production. Existing variables win over the file.
if (existsSync('../../.env')) process.loadEnvFile('../../.env');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Migrations cannot run through pgBouncer, so on Supabase DIRECT_URL is the :5432 connection.
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL!,
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});

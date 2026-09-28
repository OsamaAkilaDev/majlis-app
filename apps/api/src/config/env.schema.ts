import { z } from 'zod';

const postgresUrl = z
  .string()
  .refine((v) => /^postgres(ql)?:\/\//.test(v), { message: 'must be a postgres:// URL' });

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(3001),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: postgresUrl,
  SUPABASE_STORAGE_URL: z
    .string()
    .refine((v) => v.startsWith('https://'), { message: 'must be an https URL' }),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20, 'must be a real service role key'),
  /** Where links in emails point. */
  PUBLIC_WEB_ORIGIN: z.url().default('http://localhost:3000'),
});

export type Env = z.infer<typeof envSchema>;

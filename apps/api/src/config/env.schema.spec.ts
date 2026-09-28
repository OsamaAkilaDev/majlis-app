import { describe, expect, it } from 'vitest';
import { envSchema } from './env.schema';

const valid = {
  DATABASE_URL: 'postgresql://majlis:majlis@localhost:5432/majlis_dev?schema=public',
  SUPABASE_STORAGE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'x'.repeat(40),
};

describe('envSchema', () => {
  it('applies defaults for the optional variables', () => {
    const env = envSchema.parse(valid);
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3001);
    expect(env.LOG_LEVEL).toBe('info');
  });

  it('coerces PORT from the string the environment always gives us', () => {
    expect(envSchema.parse({ ...valid, PORT: '8080' }).PORT).toBe(8080);
  });

  it('rejects a missing DATABASE_URL rather than starting a broken server', () => {
    const { DATABASE_URL: _omitted, ...rest } = valid;
    expect(() => envSchema.parse(rest)).toThrow();
  });

  it('rejects a DATABASE_URL that is not a postgres URL', () => {
    expect(() => envSchema.parse({ ...valid, DATABASE_URL: 'mysql://localhost/x' })).toThrow();
  });

  it('accepts the postgres:// scheme as well as postgresql://', () => {
    expect(() => envSchema.parse({ ...valid, DATABASE_URL: 'postgres://a:b@h:5432/d' })).not.toThrow();
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => envSchema.parse({ ...valid, NODE_ENV: 'staging' })).toThrow();
  });
});

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/d',
  SUPABASE_STORAGE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'x'.repeat(40),
};

describe('SUPABASE_STORAGE_URL', () => {
  it('rejects an http Supabase URL, which would send the service key in clear', () => {
    const r = envSchema.safeParse({ ...base, SUPABASE_STORAGE_URL: 'http://example.supabase.co' });
    expect(r.success).toBe(false);
  });
});

import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StorageService } from './storage.service';

const KEY = 'service-role-key-value';

function serviceWith(fetchImpl: typeof fetch) {
  const config = new ConfigService({
    SUPABASE_STORAGE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: KEY,
  });
  const logger = { warn: vi.fn(), error: vi.fn() };
  vi.stubGlobal('fetch', fetchImpl);
  return { svc: new StorageService(config as never, logger as never), logger };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createSignedUploadUrl', () => {
  it('authenticates with the service role key and returns an absolute URL', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const { svc } = serviceWith((async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ url: '/object/upload/sign/majlis-storage/clubs/a/logo.webp?token=tok' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch);

    const out = await svc.createSignedUploadUrl('clubs/a/logo.webp');

    // A relative URL would send the browser's PUT to the web app's own origin.
    expect(out.signedUrl.startsWith('https://example.supabase.co/storage/v1/')).toBe(true);
    expect(out.token).toBe('tok');
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
  });

  it('throws rather than returning a broken URL when Supabase refuses', async () => {
    // A plausible `url` alongside the error, so only the `res.ok` check can make this throw.
    const { svc } = serviceWith((async () =>
      new Response(
        JSON.stringify({
          error: 'Unauthorized',
          url: '/object/upload/sign/majlis-storage/clubs/a/logo.webp?token=bogus',
        }),
        { status: 401 },
      )) as unknown as typeof fetch);

    await expect(svc.createSignedUploadUrl('clubs/a/logo.webp')).rejects.toThrow(
      /refused to sign an upload url: 401/i,
    );
  });
});

describe('statObject', () => {
  it('returns null for a 404, the documented not-found status, without warning', async () => {
    const { svc, logger } = serviceWith((async () => new Response(null, { status: 404 })) as unknown as typeof fetch);
    expect(await svc.statObject('clubs/a/logo.webp')).toBeNull();
    // Warning here would drown out the 400 branch's warning, which matters.
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('returns null for a 400 too, and warns since that status is not unambiguous', async () => {
    // Verified live: a missing object answers 400 (NoSuchKey), not the documented 404.
    const { svc, logger } = serviceWith((async () => new Response(null, { status: 400 })) as unknown as typeof fetch);
    expect(await svc.statObject('clubs/a/logo.webp')).toBeNull();
    // A 400 can also be a revoked key, so the warning must not be dropped.
    expect(logger.warn).toHaveBeenCalledTimes(1);
    const [payload] = logger.warn.mock.calls[0] as [Record<string, unknown>, string];
    expect(payload).toEqual({ path: 'clubs/a/logo.webp', status: 400 });
    expect(payload).not.toHaveProperty('key');
  });

  it('reports the size and content type of an object that does exist', async () => {
    const { svc } = serviceWith((async () =>
      new Response(null, {
        status: 200,
        headers: { 'content-length': '1234', 'content-type': 'image/webp' },
      })) as unknown as typeof fetch);

    expect(await svc.statObject('clubs/a/logo.webp')).toEqual({ size: 1234, contentType: 'image/webp' });
  });

  it('treats a missing content-length as size zero rather than NaN', async () => {
    const { svc } = serviceWith((async () =>
      new Response(null, { status: 200, headers: { 'content-type': 'image/webp' } })) as unknown as typeof fetch);

    expect(await svc.statObject('clubs/a/logo.webp')).toEqual({ size: 0, contentType: 'image/webp' });
  });
});

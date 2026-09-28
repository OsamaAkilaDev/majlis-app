import { cookies } from 'next/headers';
import { API_ORIGIN } from '@/lib/api-origin';

/** Status 0 is a request that got no answer. */
async function fetchRaw(path: string): Promise<{ status: number; body: unknown }> {
  try {
    const res = await fetch(`${API_ORIGIN}/api/v1${path}`, {
      headers: { cookie: (await cookies()).toString(), accept: 'application/json' },
      cache: 'no-store',
    });
    return { status: res.status, body: res.ok ? await res.json() : null };
  } catch {
    // Never log this: the error can carry request headers, cookie included.
    return { status: 0, body: null };
  }
}

const ok = (status: number) => status >= 200 && status < 300;

/** Server-side twin of lib/api.ts. Null on any failure, never a throw: callers treat it as a first-paint hint. */
export async function serverFetch<T>(path: string): Promise<T | null> {
  const { status, body } = await fetchRaw(path);
  return ok(status) ? (body as T) : null;
}

/** Null only on 404 or 403; any other failure throws, so a dead API is never reported as a missing club. */
export async function serverFind<T>(path: string): Promise<T | null> {
  const { status, body } = await fetchRaw(path);
  if (status === 404 || status === 403) return null;
  if (!ok(status)) throw new Error(status ? `The API answered ${status}.` : 'The API is unreachable.');
  return body as T;
}

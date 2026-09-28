import { problemDetailsSchema, type ProblemFieldError } from '@majlis/contracts/problem';

const API_BASE = '/api/v1';

// Paths where a 401 is an answer the caller renders, not a dead session. An expired reset link answers 401.
const OWN_401 = ['/auth/login', '/auth/signup', '/auth/me', '/auth/reset-password'];

// Re-renders the current page's server data after a write.
let invalidate: (() => void) | undefined;

export function onMutation(fn: () => void): void {
  invalidate = fn;
}

export class ProblemError extends Error {
  readonly status: number;
  readonly title: string;
  readonly detail: string | undefined;
  readonly requestId: string | undefined;
  readonly errors: ProblemFieldError[];

  constructor(init: {
    status: number;
    title: string;
    detail?: string;
    requestId?: string;
    errors?: ProblemFieldError[];
  }) {
    super(init.detail ?? init.title);
    this.name = 'ProblemError';
    this.status = init.status;
    this.title = init.title;
    this.detail = init.detail;
    this.requestId = init.requestId;
    this.errors = init.errors ?? [];
  }

  fieldError(path: string): string | undefined {
    return this.errors.find((e) => e.path === path)?.message;
  }
}

async function toProblem(res: Response): Promise<ProblemError> {
  try {
    const parsed = problemDetailsSchema.safeParse(await res.json());
    if (parsed.success) {
      return new ProblemError({
        status: parsed.data.status,
        title: parsed.data.title,
        ...(parsed.data.detail === undefined ? {} : { detail: parsed.data.detail }),
        ...(parsed.data.requestId === undefined ? {} : { requestId: parsed.data.requestId }),
        ...(parsed.data.errors === undefined ? {} : { errors: parsed.data.errors }),
      });
    }
  } catch {
    // A gateway error is HTML, not JSON. Fall through to the status-only form.
  }
  return new ProblemError({ status: res.status, title: res.statusText || 'Request failed' });
}

async function send(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: { accept: 'application/json', ...init?.headers },
  });
}

/** `invalidate: false` skips the refresh, for a write no other part of the page renders. */
export type ApiInit = RequestInit & { invalidate?: boolean };

/** One request, with the dead-session exit. */
async function request(path: string, { invalidate: drop = true, ...init }: ApiInit = {}): Promise<Response> {
  const res = await send(path, init);

  // Ended here, or a revoked session leaves every screen stuck on its skeleton.
  if (res.status === 401 && !OWN_401.includes(path) && typeof window !== 'undefined') {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- no router outside a component, and a full load drops the dead session's client state
    window.location.assign('/login');
  }

  if (!res.ok) throw await toProblem(res);

  if (drop && init.method && init.method !== 'GET') invalidate?.();

  return res;
}

export async function apiFetch<T>(path: string, init?: ApiInit): Promise<T> {
  const res = await request(path, init);
  // `res.json()` on an empty body throws, and 204 is not the only bodyless success; 202 is one.
  const body = await res.text();
  return (body ? JSON.parse(body) : undefined) as T;
}

export const NO_RESPONSE = 'Could not reach the server. Check your connection and try again.';

/** What a form shows for a failed request: the API's words, or `fallback`. */
export function problemMessage(err: unknown, fallback: string): string {
  return err instanceof ProblemError ? (err.detail ?? err.title) : fallback;
}

/** A failure as a ProblemError, so a request that never got an answer still reaches the form. */
export function asProblem(err: unknown): ProblemError {
  return err instanceof ProblemError ? err : new ProblemError({ status: 0, title: NO_RESPONSE });
}

/** A read the viewer may not be allowed: 403 is "not yours to see", null. */
export async function optional<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch (err) {
    if (err instanceof ProblemError && err.status === 403) return null;
    throw err;
  }
}

export const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

/** Query string from a sparse record; undefined values are omitted, never sent as "undefined". */
export function qs(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}

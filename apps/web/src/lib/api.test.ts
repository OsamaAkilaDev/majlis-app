import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, asProblem, onMutation, optional, ProblemError, problemMessage, qs } from './api';

type Call = { url: string; init?: RequestInit };

function mockFetch(responses: Array<() => Response>) {
  const calls: Call[] = [];
  let i = 0;
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const make = responses[Math.min(i, responses.length - 1)];
    i += 1;
    // Test helper only: responses is always non-empty at every call site.
    return make!();
  });
  vi.stubGlobal('fetch', fn);
  return calls;
}

const json = (body: unknown, status = 200, type = 'application/json') =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': type } });

const problem = (status: number, extra: Record<string, unknown> = {}) =>
  json({ type: 'about:blank', title: 'Nope', status, ...extra }, status, 'application/problem+json');

afterEach(() => vi.unstubAllGlobals());

describe('apiFetch', () => {
  it('returns the parsed body on 200', async () => {
    mockFetch([() => json({ id: 'u1' })]);
    await expect(apiFetch<{ id: string }>('/auth/me')).resolves.toEqual({ id: 'u1' });
  });

  it('prefixes the path with /api/v1 and sends credentials', async () => {
    // Calling the API origin directly goes cross-origin and drops the cookie.
    const calls = mockFetch([() => json({})]);
    await apiFetch('/auth/me');
    expect(calls[0]?.url).toBe('/api/v1/auth/me');
    expect(calls[0]?.init?.credentials).toBe('same-origin');
  });

  it('throws ProblemError carrying status, title and errors[]', async () => {
    mockFetch([
      () =>
        problem(422, {
          detail: 'Validation failed',
          requestId: 'req-1',
          errors: [{ path: 'email', message: 'Enter a university email address.' }],
        }),
    ]);
    const err = (await apiFetch('/auth/signup', { method: 'POST' }).catch((e) => e)) as ProblemError;
    expect(err).toBeInstanceOf(ProblemError);
    expect(err.status).toBe(422);
    expect(err.requestId).toBe('req-1');
    expect(err.fieldError('email')).toBe('Enter a university email address.');
    expect(err.fieldError('password')).toBeUndefined();
  });

  it('throws ProblemError on a non-JSON 500 rather than a parse error', async () => {
    mockFetch([() => new Response('<html>502</html>', { status: 502, headers: { 'content-type': 'text/html' } })]);
    const err = (await apiFetch('/me').catch((e) => e)) as ProblemError;
    expect(err).toBeInstanceOf(ProblemError);
    expect(err.status).toBe(502);
    expect(err.errors).toEqual([]);
  });

  it('sends a dead session to /login', async () => {
    // A rejection inside a load() effect reaches no error boundary, so the redirect must happen here.
    const assign = vi.fn();
    vi.stubGlobal('window', { location: { assign } });
    mockFetch([() => problem(401)]);
    await expect(apiFetch('/me/certificates')).rejects.toBeInstanceOf(ProblemError);
    expect(assign).toHaveBeenCalledWith('/login');
  });

  it('leaves a wrong password on the sign-in form rather than reloading it', async () => {
    const assign = vi.fn();
    vi.stubGlobal('window', { location: { assign } });
    mockFetch([() => problem(401, { detail: 'Email or password is incorrect.' })]);
    await expect(apiFetch('/auth/login', { method: 'POST' })).rejects.toBeInstanceOf(ProblemError);
    expect(assign).not.toHaveBeenCalled();
  });

  it('returns undefined for a 204', async () => {
    mockFetch([() => new Response(null, { status: 204 })]);
    await expect(apiFetch('/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('returns undefined for a bodyless 202, not a parse error', async () => {
    // /auth/forgot-password answers 202 with no body; a 204-only check would throw here.
    mockFetch([() => new Response(null, { status: 202 })]);
    await expect(apiFetch('/auth/forgot-password', { method: 'POST' })).resolves.toBeUndefined();
  });
});

describe('onMutation', () => {
  it('fires after a mutation succeeds', async () => {
    const invalidate = vi.fn();
    onMutation(invalidate);
    mockFetch([() => json({ id: 'r1' })]);
    await apiFetch('/events/e1/registrations', { method: 'POST' });
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('does not fire for a read', async () => {
    // Invalidating on reads refreshes the router on every data load, in a loop.
    const invalidate = vi.fn();
    onMutation(invalidate);
    mockFetch([() => json({ items: [] })]);
    await apiFetch('/events?upcoming=true');
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('does not fire when the mutation is refused', async () => {
    const invalidate = vi.fn();
    onMutation(invalidate);
    mockFetch([() => problem(422)]);
    await expect(apiFetch('/clubs', { method: 'POST' })).rejects.toBeInstanceOf(ProblemError);
    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe('problemMessage', () => {
  it('prefers the detail, then the title', () => {
    expect(problemMessage(new ProblemError({ status: 409, title: 'Conflict', detail: 'Expired' }), 'x')).toBe('Expired');
    expect(problemMessage(new ProblemError({ status: 409, title: 'Conflict' }), 'x')).toBe('Conflict');
  });

  it('falls back for a failure that is not a problem', () => {
    expect(problemMessage(new TypeError('Failed to fetch'), 'That failed.')).toBe('That failed.');
  });
});

describe('asProblem', () => {
  it('passes a ProblemError through untouched', () => {
    const err = new ProblemError({ status: 422, title: 'Bad', errors: [{ path: 'name', message: 'm' }] });
    expect(asProblem(err)).toBe(err);
  });

  it('turns a network failure into a form-level problem with no field errors', () => {
    const p = asProblem(new TypeError('Failed to fetch'));
    expect(p).toBeInstanceOf(ProblemError);
    expect(p.errors).toEqual([]);
    expect(p.title).toMatch(/could not reach/i);
  });
});

describe('optional', () => {
  it('reads a 403 as null', async () => {
    await expect(optional(Promise.reject(new ProblemError({ status: 403, title: 'No' })))).resolves.toBeNull();
  });

  it('rethrows anything else', async () => {
    const err = new ProblemError({ status: 404, title: 'Gone' });
    await expect(optional(Promise.reject(err))).rejects.toBe(err);
  });
});

describe('apiFetch invalidate: false', () => {
  it('does not fire onMutation, and does not send the flag', async () => {
    const calls = mockFetch([() => json({})]);
    const spy = vi.fn();
    onMutation(spy);
    await apiFetch('/events/e1/check-in/manual', { method: 'POST', invalidate: false });
    expect(spy).not.toHaveBeenCalled();
    expect(calls[0]?.init).not.toHaveProperty('invalidate');
  });
});

describe('qs', () => {
  it('omits an undefined value rather than sending the string "undefined"', () => {
    expect(qs({ status: undefined, q: 'robotics' })).toBe('?q=robotics');
  });

  it('is empty when every value is undefined', () => {
    expect(qs({ status: undefined })).toBe('');
  });

  // The two cases a truthiness check gets wrong.
  it('keeps a false boolean', () => {
    expect(qs({ upcoming: false })).toBe('?upcoming=false');
  });

  it('keeps a zero', () => {
    expect(qs({ capacity: 0 })).toBe('?capacity=0');
  });

  it('stringifies numbers and booleans', () => {
    expect(qs({ capacity: 20, unread: true })).toBe('?capacity=20&unread=true');
  });

  it('percent-encodes a value', () => {
    expect(qs({ q: 'a b&c' })).toBe('?q=a+b%26c');
  });
});

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { sessionUserSchema, type SessionUser } from '@majlis/contracts';
import { API_ORIGIN } from '@/lib/api-origin';
import { landingFor } from '@/lib/routing';

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookie = (await cookies()).toString();
  if (!cookie) return null;

  try {
    const res = await fetch(`${API_ORIGIN}/api/v1/auth/me`, {
      headers: { cookie, accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) return null;

    const parsed = sessionUserSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  } catch {
    // Fail closed, never 500. Never log this: the error can carry request headers, cookie included.
    return null;
  }
}

/** Layouts call this before returning markup, so no page renders an auth-required panel inside itself. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  return user;
}

/** Only /login and /signup call this; a reset link must work where the user is still signed in. */
export async function bounceIfSignedIn(): Promise<void> {
  const user = await getSessionUser();
  if (user) redirect(landingFor(user));
}

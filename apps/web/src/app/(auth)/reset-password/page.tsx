import type { ResetPasswordPreview } from '@majlis/contracts';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { API_ORIGIN } from '@/lib/api-origin';
import { BRAND } from '@/lib/brand';
import { ResetPasswordForm } from './ResetPasswordForm';

export const metadata: Metadata = { title: 'Set a new password' };

const UNREACHABLE = 'Could not reach the server. Check your connection and try again.';

/** Resolved on the server, so a spent link is a dead end and the screen can name the account.
 *  Not serverFetch: a spent link (401) and an unreachable API need different words. */
async function resolveLink(token: string): Promise<ResetPasswordPreview | { problem: string }> {
  try {
    const res = await fetch(
      `${API_ORIGIN}/api/v1/auth/reset-password?token=${encodeURIComponent(token)}`,
      { cache: 'no-store', headers: { accept: 'application/json' } },
    );
    if (res.ok) return (await res.json()) as ResetPasswordPreview;
    const body = (await res.json()) as { detail?: string; title?: string };
    return { problem: body.detail ?? body.title ?? UNREACHABLE };
  } catch {
    // Never logged: the request carries the reset token.
    return { problem: UNREACHABLE };
  }
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  // No token means the address was typed by hand.
  if (!token) redirect('/forgot-password');

  const link = await resolveLink(token);

  if ('problem' in link) {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="font-display text-display text-ink">{BRAND.product}</h1>

        <p role="alert" className="rounded-control bg-bad-soft px-3 py-2 text-sm text-bad-fg">
          {link.problem}
        </p>

        <Button asChild size="lg" className="h-11">
          <Link href="/forgot-password">Request a new link</Link>
        </Button>

        <Link href="/login" className="self-start text-sm text-primary underline underline-offset-4">
          Sign in
        </Link>
      </div>
    );
  }

  return <ResetPasswordForm token={token} email={link.email} />;
}

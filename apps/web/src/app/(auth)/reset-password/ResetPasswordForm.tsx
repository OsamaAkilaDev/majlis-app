'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { PASSWORD_MISMATCH, PasswordRule } from '@/components/auth/AuthForm';
import { Field } from '@/components/Field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiFetch, json, NO_RESPONSE, ProblemError } from '@/lib/api';
import { routeProblem } from '@/lib/auth-problem';
import { BRAND } from '@/lib/brand';

/** The token is never rendered; the account's email is shown instead. */
export function ResetPasswordForm({ token, email }: { token: string; email: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<ProblemError | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [mismatch, setMismatch] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (password !== confirm) {
      setMismatch(PASSWORD_MISMATCH);
      return;
    }

    setPending(true);
    setProblem(null);
    setNetworkError(null);

    try {
      await apiFetch('/auth/reset-password', json({ token, password }));
      // The reset revoked every session, this one included.
      router.replace('/login');
    } catch (err) {
      if (err instanceof ProblemError) setProblem(err);
      else setNetworkError(NO_RESPONSE);
    } finally {
      setPending(false);
    }
  }

  const { fields, form } = routeProblem('reset', problem, networkError);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <h1 className="font-display text-display text-ink">{BRAND.product}</h1>

      {/* readOnly, not disabled: password managers skip disabled inputs and need the username. */}
      <Field label="Account">
        <Input
          name="email"
          type="email"
          autoComplete="username"
          readOnly
          value={email}
          className="h-11 cursor-default bg-surface-2 text-ink-2"
        />
      </Field>

      <Field
        label="New password"
        error={fields.password}
        constraint={<PasswordRule password={password} />}
      >
        <Input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          className="h-11"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setMismatch(null);
          }}
        />
      </Field>

      <Field label="Confirm password" error={mismatch ?? undefined}>
        <Input
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          className="h-11"
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value);
            setMismatch(null);
          }}
        />
      </Field>

      {form ? (
        <p role="alert" className="rounded-control bg-bad-soft px-3 py-2 text-sm text-bad-fg">
          {form}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={pending} className="h-11">
        Set password
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/login" className="text-sm text-primary underline underline-offset-4">
          Sign in
        </Link>
        <Link href="/forgot-password" className="text-sm text-ink-2 underline underline-offset-4">
          Request a new link
        </Link>
      </div>
    </form>
  );
}

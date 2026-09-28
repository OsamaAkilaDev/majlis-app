'use client';

import type { CheckInResult, EventSummary } from '@majlis/contracts';
import { useCallback, useEffect, useState } from 'react';
import { Field } from '@/components/Field';
import { STATUS } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { problemMessage } from '@/lib/api';
import { listAttendance, manualCheckIn } from '@/lib/attendance';
import { cn } from '@/lib/cn';

function outcome(result: CheckInResult): { tone: 'ok' | 'warn' | 'bad'; text: string } {
  switch (result.result) {
    case 'CHECKED_IN':
      return { tone: 'ok', text: `${result.fullName} checked in` };
    case 'ALREADY_CHECKED_IN':
      return { tone: 'warn', text: `${result.fullName} is already checked in` };
    case 'NOT_REGISTERED':
      return { tone: 'bad', text: 'Not registered' };
    case 'REGISTRATION_CANCELLED':
      return { tone: 'bad', text: 'Registration cancelled' };
    case 'EVENT_NOT_OPEN':
      return { tone: 'bad', text: `Check-in is not open: ${STATUS[result.eventStatus].label}` };
  }
}

const TONE = { ok: 'text-ok-fg', warn: 'text-warn-fg', bad: 'text-bad-fg' } as const;

export function CheckInSession({ event }: { event: EventSummary }) {
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [last, setLast] = useState<ReturnType<typeof outcome> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<{ checkedIn: number; expected: number } | null>(null);

  // A 403 (may check in, may not read the roster) just hides the counter.
  const refreshCounts = useCallback(async () => {
    try {
      const list = await listAttendance(event.id);
      setCounts({ checkedIn: list.checkedIn, expected: list.expected });
    } catch {
      setCounts(null);
    }
  }, [event.id]);

  useEffect(() => {
    void refreshCounts();
  }, [refreshCounts]);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const result = await manualCheckIn(event.id, { email: email.trim(), reason: reason.trim() });
      setLast(outcome(result));
      if (result.result === 'CHECKED_IN') {
        setEmail('');
        void refreshCounts();
      }
    } catch (err) {
      setError(problemMessage(err, 'That check-in could not be sent.'));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-md flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate font-semibold text-ink">{event.title}</span>
        {counts ? (
          <span className="tabular shrink-0 text-sm text-ink-2">
            {counts.checkedIn} / {counts.expected}
          </span>
        ) : null}
      </div>

      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label="Email">
          <Input
            type="email"
            inputMode="email"
            autoComplete="off"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12"
          />
        </Field>
        <Field label="Reason">
          <Input
            required
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="h-12"
          />
        </Field>
        {/* text-base, not text-body: tailwind-merge reads text-body as a colour and drops text-primary-fg. */}
        <Button type="submit" disabled={pending} className="h-12 text-base">
          Check in
        </Button>
      </form>

      {error ? (
        <p role="alert" className="text-sm text-bad-fg">
          {error}
        </p>
      ) : last ? (
        <p role="status" className={cn('font-semibold', TONE[last.tone])}>
          {last.text}
        </p>
      ) : null}
    </section>
  );
}

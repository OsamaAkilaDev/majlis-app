'use client';

import type { EventDetail } from '@majlis/contracts';
import { useState } from 'react';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { problemMessage } from '@/lib/api';
import { REGISTRATION_CHANGEABLE } from '@/lib/event-actions';
import { cancelRegistration, register } from '@/lib/events';

type Action =
  | { kind: 'register' | 'waitlist' | 'cancel' }
  | { kind: 'held' | 'none' }
  | { kind: 'refused'; why: string };

/** What the viewer can do. Club eligibility is not derivable here, so that refusal comes from
 *  the API; hiding a control is presentation, never protection. */
export function decide(event: EventDetail, now: Date): Action {
  const held = event.viewerRegistrationStatus;
  if (held === 'CONFIRMED' || held === 'WAITLISTED') {
    return REGISTRATION_CHANGEABLE.includes(event.status)
      ? { kind: 'cancel' }
      : { kind: 'held' };
  }
  if (held !== null) return { kind: 'held' };

  // Over or off: the status badge says so, and a greyed Register could never be pressed.
  if (event.status !== 'PUBLISHED') return { kind: 'none' };
  if (now < new Date(event.registrationOpensAt)) {
    return { kind: 'refused', why: 'Registration has not opened yet' };
  }
  if (now >= new Date(event.registrationClosesAt)) {
    return { kind: 'refused', why: 'Registration has closed' };
  }

  if (event.confirmedCount >= event.capacity) {
    return event.waitlistEnabled
      ? { kind: 'waitlist' }
      : { kind: 'refused', why: 'This event is full and has no waitlist' };
  }
  return { kind: 'register' };
}

export function RegisterControl({
  event,
  now,
  onChanged,
}: {
  event: EventDetail;
  /** The server's clock, so the first paint and hydration agree. */
  now: number;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const action = decide(event, new Date(now));

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await onChanged();
    } catch (err) {
      setError(problemMessage(err, 'Something went wrong'));
    } finally {
      setBusy(false);
    }
  }

  // Nothing to say and nothing to press: no wrapper, or its gap still shows.
  if (action.kind === 'none' && !event.viewerRegistrationStatus) return null;

  return (
    <div className="flex flex-col gap-2">
      {event.viewerRegistrationStatus ? (
        <div className="flex items-center gap-2">
          <StatusBadge status={event.viewerRegistrationStatus} />
          {event.viewerWaitlistPosition === null ? null : (
            <span className="tabular text-sm text-ink-2">Position {event.viewerWaitlistPosition}</span>
          )}
        </div>
      ) : null}

      {action.kind === 'register' ? (
        <Button onClick={() => run(() => register(event.id))} disabled={busy}>
          Register
        </Button>
      ) : null}

      {action.kind === 'waitlist' ? (
        <Button onClick={() => run(() => register(event.id))} disabled={busy}>
          Join waitlist
        </Button>
      ) : null}

      {action.kind === 'cancel' ? (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => run(() => cancelRegistration(event.id))}
        >
          Cancel registration
        </Button>
      ) : null}

      {/* A disabled control's accessible name carries the reason, or a screen reader learns nothing. */}
      {action.kind === 'refused' ? (
        // The reason is the label, as in JoinControl.
        <Button disabled>{action.why}</Button>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-bad-fg">
          {error}
        </p>
      ) : null}
    </div>
  );
}

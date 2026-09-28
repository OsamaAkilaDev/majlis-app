'use client';

import type { MyRegistration, MyRegistrationList } from '@majlis/contracts';
import Link from 'next/link';
import { useState } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TimeRange } from '@/components/LocalTime';
import { problemMessage } from '@/lib/api';
import { cancelRegistration, myRegistrations } from '@/lib/events';
import { REGISTRATION_CHANGEABLE } from '@/lib/event-actions';
import { useList } from '@/lib/use-list';

export function RegistrationsManager({ initial }: { initial: MyRegistrationList | null }) {
  const { items, reload } = useList(
    initial,
    () => myRegistrations({}),
    { deps: [] },
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function cancel(registration: MyRegistration) {
    setBusy(registration.id);
    setError(null);
    try {
      await cancelRegistration(registration.event.id);
      reload();
    } catch (err) {
      setError(problemMessage(err, 'Something went wrong'));
    } finally {
      setBusy(null);
    }
  }

  if (items === null) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title="Nothing booked yet"
        action={
          <Button asChild>
            <Link href="/events/discover">Browse events</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <p role="alert" className="text-sm text-bad-fg">
          {error}
        </p>
      ) : null}

      <ul className="grid gap-2 lg:grid-cols-2">
        {items.map((registration) => {
          const event = registration.event;

          return (
            <li
              key={registration.id}
              className="flex h-full flex-col gap-2 rounded-card border border-border bg-surface p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <Link href={`/events/${event.id}`} className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink">{event.title}</span>
                  <span className="block truncate text-sm text-ink-2">{event.clubName}</span>
                </Link>
                <StatusBadge status={registration.status} />
              </div>

              <p className="flex flex-wrap items-baseline gap-x-3 text-sm text-ink-2">
                <TimeRange startsAt={event.startsAt} endsAt={event.endsAt} className="tabular" />
              </p>

              <div className="mt-auto flex items-center justify-between gap-3">
                <span className="tabular text-sm text-ink-2">
                  {registration.waitlistPosition === null
                    ? ''
                    : `Position ${registration.waitlistPosition}`}
                </span>
                {REGISTRATION_CHANGEABLE.includes(event.status) ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === registration.id}
                    onClick={() => cancel(registration)}
                  >
                    Cancel
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

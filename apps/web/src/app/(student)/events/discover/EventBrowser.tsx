'use client';

import type { EventList, EventSummary } from '@majlis/contracts';
import Link from 'next/link';
import { EmptyState } from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';
import { Skeleton } from '@/components/ui/skeleton';
import { TimeRange } from '@/components/LocalTime';
import { listEvents } from '@/lib/events';
import { useList } from '@/lib/use-list';

export function seatsLeft(event: EventSummary): number {
  return Math.max(event.capacity - event.confirmedCount, 0);
}

function EventCard({ event }: { event: EventSummary }) {
  const left = seatsLeft(event);

  return (
    <Link
      href={`/events/${event.id}`}
      className="flex h-full flex-col gap-2 rounded-card border border-border bg-surface p-3 transition-colors duration-(--dur-fast) ease-(--ease-out) hover:bg-surface-2"
    >
      <span className="flex items-center gap-2">
        <img
          src={event.clubLogoUrl}
          alt=""
          className="size-5 shrink-0 rounded-control border border-border bg-surface-2 object-cover"
        />
        <span className="min-w-0 flex-1 truncate text-sm text-ink-2">{event.clubName}</span>
        {event.status === 'PUBLISHED' ? null : <StatusBadge status={event.status} />}
      </span>

      <span className="block font-semibold text-ink">{event.title}</span>

      <TimeRange
        startsAt={event.startsAt}
        endsAt={event.endsAt}
        className="tabular text-sm text-ink-2"
      />

      {/* Pinned to the card foot so seat counts line up across a grid row. */}
      <span className="mt-auto flex items-center justify-between gap-3 text-sm">
        <span className="min-w-0 truncate text-ink-2">{event.venue ?? 'Online'}</span>
        <span className={left === 0 ? 'tabular text-warn-fg' : 'tabular text-ink-2'}>
          {left === 0 ? 'Full' : `${left} of ${event.capacity} left`}
        </span>
      </span>
    </Link>
  );
}

export function EventBrowser({ initialEvents }: { initialEvents: EventList | null }) {
  const { items } = useList(initialEvents, () => listEvents({ upcoming: true }), { deps: [] });

  return (
    <div className="flex flex-col gap-4">
      {items === null ? (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState title="No events found" />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((event) => (
            <li key={event.id}>
              <EventCard event={event} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

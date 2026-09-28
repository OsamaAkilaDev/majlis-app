'use client';

import type { EventSummary } from '@majlis/contracts';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { StatusBadge } from '@/components/StatusBadge';
import { cn } from '@/lib/cn';
import { formatChip, formatClock } from '@/lib/event-time';
import { useViewerZone } from '@/lib/use-viewer-zone';

/** A non-breaking space holds each line's height until the zone is known. */
const HOLD = ' ';

export function EventRow({
  event,
  trailing,
  club = true,
}: {
  event: EventSummary;
  trailing?: ReactNode;
  /** Off on a club's own page. */
  club?: boolean;
}) {
  const zone = useViewerZone();
  const chip = zone ? formatChip(event.startsAt, zone) : null;

  return (
    <Link
      href={`/events/${event.id}`}
      className="flex items-center gap-3 rounded-card border border-border bg-surface p-2.5 transition-colors duration-(--dur-fast) ease-(--ease-out) hover:bg-surface-2"
    >
      <span className="w-11 shrink-0 overflow-hidden rounded-control border border-border bg-surface-2 text-center">
        <span className="block bg-primary py-0.5 text-[0.5625rem] font-bold tracking-[0.06em] text-primary-fg uppercase">
          {chip ? chip.month : HOLD}
        </span>
        <span className="block py-0.5 text-[1.0625rem] font-bold tabular-nums text-ink">
          {chip ? chip.day : HOLD}
        </span>
      </span>

      <span className="min-w-0 flex-1">
        {club ? <span className="block truncate text-xs text-ink-2">{event.clubName}</span> : null}
        <span className="block truncate font-semibold text-ink">{event.title}</span>
        <span className="block truncate text-[0.8125rem] tabular-nums text-ink-2">
          {zone ? `${formatClock(event.startsAt, zone)} · ${event.venue ?? 'Online'}` : HOLD}
        </span>
      </span>

      {trailing}
    </Link>
  );
}

/** Seats left, or the status for a cancelled event, which still lists. */
export function EventSeats({ event }: { event: EventSummary }) {
  if (event.status === 'CANCELLED') return <StatusBadge status={event.status} />;
  const left = Math.max(event.capacity - event.confirmedCount, 0);
  return (
    <span
      className={cn(
        'shrink-0 text-[0.8125rem] tabular-nums',
        left === 0 ? 'text-warn-fg' : 'text-ink-2',
      )}
    >
      {left === 0 ? 'Full' : `${left} left`}
    </span>
  );
}

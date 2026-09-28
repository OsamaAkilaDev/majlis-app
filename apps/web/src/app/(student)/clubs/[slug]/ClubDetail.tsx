'use client';

import type { ClubDetail as Club, EventList, EventSummary } from '@majlis/contracts';
import { CaretRight, Plus } from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ClubHeader } from '@/components/ClubHeader';
import { EmptyState } from '@/components/EmptyState';
import { EventRow, EventSeats } from '@/components/EventRow';
import { ListSection } from '@/components/ListSection';
import { useShellSession } from '@/components/shell/shell-session';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ProblemError } from '@/lib/api';
import { canCreateEvent, clubSectionsFor } from '@/lib/club-sections';
import { getClubBySlug } from '@/lib/clubs';
import { splitOnEnd } from '@/lib/event-schedule';
import { listEvents } from '@/lib/events';
import { ICON_WEIGHT } from '@/lib/icons';
import { useAsyncError } from '@/lib/use-async-error';
import { useList } from '@/lib/use-list';
import { AboutBlock, CommitteeBlock, DepartmentBlock } from './ClubAbout';
import { JoinControl } from './JoinControl';
import { ManageSheet } from './ManageSheet';

function EventSection({
  title,
  events,
  past,
}: {
  title: string;
  events: EventSummary[];
  past?: boolean;
}) {
  return (
    <ListSection title={title} count={events.length} heading="h3">
        {events.map((event) => (
          <li key={event.id}>
            <EventRow
              event={event}
              club={false}
              trailing={
                past ? <StatusBadge status={event.status} compact /> : <EventSeats event={event} />
              }
            />
          </li>
        ))}
    </ListSection>
  );
}

/** Unfiltered, drafts included; split into upcoming and past here since the route has no `past` flag. */
function ClubEvents({
  clubId,
  initialEvents,
  now,
}: {
  clubId: string;
  initialEvents: EventList | null;
  now: number;
}) {
  const { items } = useList<EventSummary>(
    initialEvents,
    () => listEvents({ clubId }),
    { deps: [clubId] },
  );

  if (items === null) return <Skeleton className="h-40" />;
  if (items.length === 0) return <EmptyState title="No events" />;

  const { upcoming, past } = splitOnEnd(items, now);

  return (
    <div className="flex flex-col gap-6">
      <EventSection title="Upcoming" events={upcoming} />
      <EventSection title="Past" events={past} past />
    </div>
  );
}

/** "2026/2027" -> "2026/27", to fit a third of a 320px screen. */
function shortYear(value: string): string {
  return value.replace(/^(\d{4})\/\d{2}(\d{2})$/, '$1/$2');
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5 border-border px-2.5 py-2.5 not-first:border-l sm:px-3.5">
      {/* One line each, or three stats sit at three different heights. */}
      <dt className="truncate text-[0.625rem] font-semibold tracking-[0.06em] text-ink-3 uppercase sm:text-label sm:tracking-[0.08em]">
        {label}
      </dt>
      <dd className="truncate text-base font-semibold tabular-nums text-ink sm:text-h2">{value}</dd>
    </div>
  );
}

export function ClubDetail({
  slug,
  initialClub,
  initialEvents,
  now,
}: {
  slug: string;
  initialClub: Club | null;
  initialEvents: EventList | null;
  /** Server clock, so the upcoming/past split hydrates as it rendered. */
  now: number;
}) {
  const [club, setClub] = useState<Club | null>(initialClub);
  const [missing, setMissing] = useState(false);
  const { user } = useShellSession();

  const load = useCallback(async () => {
    try {
      setClub(await getClubBySlug(slug));
    } catch (err) {
      if (err instanceof ProblemError && err.status === 404) setMissing(true);
      else throw err;
    }
  }, [slug]);

  const fail = useAsyncError();

  useEffect(() => {
    if (!initialClub) load().catch(fail);
  }, [fail, initialClub, load]);

  if (missing) return <EmptyState title="No such club" />;
  if (!club) return <Skeleton className="h-64" />;

  const sections = clubSectionsFor(club.viewerClubRoles, user.platformRole);
  const canCreate = canCreateEvent(club.viewerClubRoles, user.platformRole);

  return (
    <div className="flex flex-col gap-6">
      <ClubHeader
        club={club}
        meta={
          <p className="truncate text-sm text-ink-2">
            {club.departmentName} · {club.category}
          </p>
        }
        badge={
          club.status === 'ACTIVE' ? null : <StatusBadge status={club.status} className="mb-1" />
        }
      />

      {sections.length > 0 || canCreate ? (
        <div className="flex flex-wrap items-center gap-2">
          {canCreate ? (
            <Button asChild size="lg" className="h-11">
              <Link href={`/clubs/${slug}/events/new`}>
                <Plus data-icon="inline-start" aria-hidden />
                New event
              </Link>
            </Button>
          ) : null}
          {sections.length > 0 ? <ManageSheet club={club} sections={sections} /> : null}
        </div>
      ) : (
        <JoinControl club={club} onChanged={load} />
      )}

      <dl className="flex border-y border-border">
        <Stat label="Members" value={club.memberCount} />
        <Stat label="Events held" value={club.eventsRun} />
        <Stat label="Year" value={shortYear(club.academicYear)} />
      </dl>

      {/* `grid-cols-1` is load-bearing: an implicit `auto` track lets a long line overflow 320px. */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <ClubEvents clubId={club.id} initialEvents={initialEvents} now={now} />

          <Link
            href={`/clubs/${slug}/about`}
            className="flex items-center gap-3 rounded-card border border-border bg-surface p-3.5 transition-colors duration-(--dur-fast) ease-(--ease-out) hover:bg-surface-2 lg:hidden"
          >
            <span className="min-w-0 flex-1">
              <span className="block font-display text-h2 text-ink">About</span>
              <span className="block truncate text-sm text-ink-3">
                {club.committee.length === 1
                  ? '1 committee member'
                  : `${club.committee.length} committee members`}
                {' · '}
                {club.departmentName}
              </span>
            </span>
            <CaretRight
              size={18}
              weight={ICON_WEIGHT}
              className="shrink-0 text-ink-3"
              aria-hidden
            />
          </Link>
        </div>

        <aside className="hidden min-w-0 flex-col gap-6 lg:flex">
          <AboutBlock club={club} />
          <CommitteeBlock club={club} />
          <DepartmentBlock club={club} />
        </aside>
      </div>
    </div>
  );
}

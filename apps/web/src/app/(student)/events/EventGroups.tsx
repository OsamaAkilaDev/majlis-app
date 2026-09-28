'use client';

import type { EventList, MyRegistrationList } from '@majlis/contracts';
import { Certificate } from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { EventRow, EventSeats } from '@/components/EventRow';
import { ListSection } from '@/components/ListSection';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { byStart } from '@/lib/event-schedule';
import { listEvents, myRegistrations } from '@/lib/events';
import { ICON_WEIGHT } from '@/lib/icons';
import { useList } from '@/lib/use-list';

type Group = { items: unknown[] | null };

/** The server hands over each list, so a group fetches only when that failed. */
function Section({ title, group, children }: { title: string; group: Group; children: ReactNode }) {
  if (group.items === null) return <Skeleton className="h-40" />;
  return (
    <ListSection title={title} count={group.items.length}>
      {children}
    </ListSection>
  );
}

export function EventGroups({
  registered,
  fromClubs,
  past,
  certifiedEventIds,
}: {
  registered: MyRegistrationList | null;
  fromClubs: EventList | null;
  past: MyRegistrationList | null;
  /** Events the viewer holds a certificate for. */
  certifiedEventIds: string[];
}) {
  const once = { deps: [] };
  const mine = useList(registered, () => myRegistrations({ past: false }), once);
  const clubs = useList(fromClubs, () => listEvents({ upcoming: true, fromMyClubs: true }), once);
  const behind = useList(past, () => myRegistrations({ past: true }), once);

  const groups = [mine, clubs, behind];
  if (groups.every((g) => g.items?.length === 0)) {
    return (
      <EmptyState
        title="Nothing yet"
        action={
          <Button asChild>
            <Link href="/events/discover">Discover events</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Section title="Registered" group={mine}>
        {byStart(mine.items ?? [], (r) => r.event.startsAt).map((registration) => (
          <li key={registration.id}>
            <EventRow
              event={registration.event}
              trailing={
                <span className="flex shrink-0 items-center gap-1.5">
                  <StatusBadge status={registration.status} />
                  {registration.waitlistPosition === null ? null : (
                    <span className="text-[0.8125rem] tabular-nums text-ink-2">
                      #{registration.waitlistPosition}
                    </span>
                  )}
                </span>
              }
            />
          </li>
        ))}
      </Section>

      <Section title="From your clubs" group={clubs}>
        {byStart(clubs.items ?? [], (e) => e.startsAt).map((event) => {
          return (
            <li key={event.id}>
              <EventRow event={event} trailing={<EventSeats event={event} />} />
            </li>
          );
        })}
      </Section>

      <Section title="Past" group={behind}>
        {byStart(behind.items ?? [], (r) => r.event.startsAt, true).map((registration) => (
          <li key={registration.id}>
            <EventRow
              event={registration.event}
              trailing={
                <span className="flex shrink-0 items-center gap-1.5">
                  {certifiedEventIds.includes(registration.event.id) ? (
                    <span
                      title="Certificate"
                      aria-label="Certificate"
                      className="inline-grid size-6 place-items-center rounded-control bg-ok-soft text-ok-fg"
                    >
                      <Certificate size={14} weight={ICON_WEIGHT} aria-hidden />
                    </span>
                  ) : null}
                  <StatusBadge status={registration.event.status} compact />
                </span>
              }
            />
          </li>
        ))}
      </Section>
    </div>
  );
}

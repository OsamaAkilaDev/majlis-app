'use client';

import type { ClubRole, EventList, SessionUser } from '@majlis/contracts';
import { Plus } from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { canCreateEvent } from '@/lib/club-sections';
import { getClub } from '@/lib/clubs';
import { Moment } from '@/components/LocalTime';
import { needsOverrideReason } from '@/lib/override';
import { useList } from '@/lib/use-list';
import { listEvents } from '@/lib/events';
import { useAsyncError } from '@/lib/use-async-error';
import { EventCreateForm } from '@/components/event/EventCreateForm';

export function EventsManager({
  clubId,
  platformRole,
  initialRoles,
  initialEvents,
}: {
  clubId: string;
  platformRole: SessionUser['platformRole'];
  initialRoles: ClubRole[] | null;
  initialEvents: EventList | null;
}) {
  const router = useRouter();
  const [roles, setRoles] = useState<ClubRole[] | null>(initialRoles);
  const { items, show } = useList(initialEvents, () =>
    listEvents({ clubId }),
  );
  const [creating, setCreating] = useState(false);
  const seeded = initialRoles !== null && initialEvents !== null;

  const load = useCallback(async () => {
    const [club, page] = await Promise.all([getClub(clubId), listEvents({ clubId })]);
    setRoles(club.viewerClubRoles);
    show(page);
  }, [clubId, show]);

  const fail = useAsyncError();

  useEffect(() => {
    if (!seeded) load().catch(fail);
  }, [seeded, load, fail]);

  if (roles === null || items === null) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="flex flex-col gap-5">
      {canCreateEvent(roles, platformRole) ? (
        <div className="flex justify-end">
          <Button onClick={() => setCreating((open) => !open)} aria-expanded={creating}>
            <Plus data-icon="inline-start" aria-hidden />
            New event
          </Button>
        </div>
      ) : null}

      {creating ? (
        <EventCreateForm
          clubId={clubId}
          override={needsOverrideReason(platformRole, roles)}
          onCreated={(id) => router.push(`/manage/${clubId}/events/${id}`)}
        />
      ) : null}

      {items.length === 0 ? (
        <EmptyState title="No events" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Event</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Starts</TableHead>
              <TableHead>Seats</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((event) => (
              <TableRow key={event.id}>
                <TableCell>
                  <Link
                    href={`/manage/${clubId}/events/${event.id}`}
                    className="font-medium text-ink hover:underline"
                  >
                    {event.title}
                  </Link>
                </TableCell>
                <TableCell>
                  <StatusBadge status={event.status} />
                </TableCell>
                <TableCell className="tabular text-ink-2">
                  <Moment at={event.startsAt} />
                </TableCell>
                <TableCell className="tabular">
                  {event.confirmedCount} / {event.capacity}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

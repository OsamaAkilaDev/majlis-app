'use client';

import type { EventList, EventSummary, UserSearchItem } from '@majlis/contracts';
import Link from 'next/link';
import { useState } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { Field } from '@/components/Field';
import { StatusBadge } from '@/components/StatusBadge';
import { UserPicker } from '@/components/UserPicker';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { problemMessage } from '@/lib/api';
import { Moment } from '@/components/LocalTime';
import { listEvents, register } from '@/lib/events';
import { useList } from '@/lib/use-list';

/** An Admin registering somebody else. The reason is required so the audit log can tell an override
 *  from a bug. */
function OverrideDialog({
  event,
  onClose,
  onDone,
}: {
  event: EventSummary | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [picked, setPicked] = useState<UserSearchItem | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function close() {
    setPicked(null);
    setReason('');
    setError(null);
    onClose();
  }

  async function submit() {
    if (!event || !picked) return;
    setPending(true);
    setError(null);
    try {
      await register(event.id, { userId: picked.id, overrideReason: reason.trim() });
      onDone();
      close();
    } catch (err) {
      setError(problemMessage(err, 'That action failed.'));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={event !== null} onOpenChange={(open) => (open ? null : close())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Register someone for {event?.title ?? 'this event'}</DialogTitle>
        </DialogHeader>
        <UserPicker value={picked} onChange={setPicked} />
        <Field label="Reason">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} required />
        </Field>
        {error ? (
          <p role="alert" className="text-sm text-bad-fg">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !picked || reason.trim().length === 0}>
            Register
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EventsOverview({ initialEvents }: { initialEvents: EventList | null }) {
  const [overriding, setOverriding] = useState<EventSummary | null>(null);
  const { items, reload } = useList(initialEvents, () => listEvents({}), { deps: [] });

  return (
    <div className="flex flex-col gap-4">
      {items === null ? (
        <Skeleton className="h-40 w-full" />
      ) : items.length === 0 ? (
        <EmptyState title="No events" />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>Club</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Starts</TableHead>
                <TableHead>Seats</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((event) => (
                <TableRow key={event.id}>
                  <TableCell>
                    <Link
                      href={`/manage/${event.clubId}/events/${event.id}`}
                      className="font-medium text-ink hover:underline"
                    >
                      {event.title}
                    </Link>
                  </TableCell>
                  <TableCell className="text-ink-2">{event.clubName}</TableCell>
                  <TableCell>
                    <StatusBadge status={event.status} />
                  </TableCell>
                  <TableCell className="tabular text-ink-2">
                    <Moment at={event.startsAt} />
                  </TableCell>
                  <TableCell className="tabular">
                    {event.confirmedCount} / {event.capacity}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      {/* Published only: the override skips eligibility, never status, so elsewhere it could only fail. */}
                      {event.status === 'PUBLISHED' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setOverriding(event)}
                          aria-label={`Register someone for ${event.title}`}
                        >
                          Register someone
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}

      <OverrideDialog event={overriding} onClose={() => setOverriding(null)} onDone={reload} />
    </div>
  );
}

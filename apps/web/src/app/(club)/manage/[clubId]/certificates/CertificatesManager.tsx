'use client';

import type { EventSummary } from '@majlis/contracts';
import { useEffect, useState } from 'react';
import { EventCertificates } from '@/components/event/EventCertificates';
import { Field } from '@/components/Field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { eventActionApplies } from '@/lib/event-actions';
import { listEvents } from '@/lib/events';
import { useAsyncError } from '@/lib/use-async-error';

export function CertificatesManager({
  clubId,
  initialEvents,
  now,
}: {
  clubId: string;
  initialEvents: EventSummary[] | null;
  /** Server clock, so the filtered list hydrates as it rendered. */
  now: number;
}) {
  const [events, setEvents] = useState<EventSummary[] | null>(initialEvents);
  const [eventId, setEventId] = useState<string | null>(null);
  const fail = useAsyncError();

  useEffect(() => {
    if (initialEvents) return;
    listEvents({ clubId })
      .then((page) => setEvents(page.items))
      .catch(fail);
  }, [clubId, initialEvents, fail]);

  if (events === null) return <Skeleton className="h-64 w-full" />;

  const issuable = events.filter((e) => eventActionApplies('certificates', e, new Date(now)));

  return (
    <div className="flex flex-col gap-5">
      <Field label="Event" group>
        <Select value={eventId ?? undefined} onValueChange={setEventId}>
          <SelectTrigger aria-label="Event" className="min-w-64 self-start">
            <SelectValue placeholder="Pick an event" />
          </SelectTrigger>
          <SelectContent>
            {issuable.map((event) => (
              <SelectItem key={event.id} value={event.id}>
                {event.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {/* Keyed, so switching events never shows the last event's rows. */}
      {eventId ? <EventCertificates key={eventId} eventId={eventId} /> : null}
    </div>
  );
}

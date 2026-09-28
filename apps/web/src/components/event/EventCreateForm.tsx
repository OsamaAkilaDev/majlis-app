'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { focusFirstInvalid } from '@/components/Field';
import { ImageUpload } from '@/components/ImageUpload';
import { OverrideReason } from '@/components/OverrideReason';
import { Button } from '@/components/ui/button';
import type { ProblemError } from '@/lib/api';
import { asProblem } from '@/lib/api';
import { createEvent, mintEventPosterUpload } from '@/lib/events';
import {
  EMPTY_EVENT,
  EventFields,
  toCreateBody,
  validateSchedule,
  type EventFormValues,
} from './EventFields';

export function EventCreateForm({
  clubId,
  override,
  onCreated,
}: {
  clubId: string;
  override: boolean;
  onCreated?: (eventId: string) => void;
}) {
  const router = useRouter();
  const [values, setValues] = useState<EventFormValues>(EMPTY_EVENT);
  const [reason, setReason] = useState('');
  const [eventId, setEventId] = useState<string | null>(null);
  const [error, setError] = useState<ProblemError | null>(null);
  const [pending, setPending] = useState(false);

  const set = useCallback(
    <K extends keyof EventFormValues>(key: K, value: EventFormValues[K]) =>
      setValues((prev) => ({ ...prev, [key]: value })),
    [],
  );

  const scheduleBroken = Object.keys(validateSchedule(values)).length > 0;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setPending(true);
    setError(null);
    try {
      // The poster route mints the event id, so it is minted even with no poster.
      const id = eventId ?? (await mintEventPosterUpload(clubId)).eventId;
      const event = await createEvent(clubId, {
        ...toCreateBody(id, values, eventId !== null),
        ...(override ? { overrideReason: reason.trim() } : {}),
      });
      if (onCreated) onCreated(event.id);
      else router.push(`/events/${event.id}`);
    } catch (err) {
      setError(asProblem(err));
      focusFirstInvalid(form);
    } finally {
      setPending(false);
    }
  }

  return (
    // noValidate: the API's field errors render inline instead of the browser bubble.
    <form
      onSubmit={submit}
      noValidate
      className="flex max-w-3xl flex-col gap-8 rounded-card border border-border bg-surface p-5"
    >
      <ImageUpload
        kind="event-poster"
        mint={async () => {
          // A re-pick mints a fresh id: the signed URL is bound to one path.
          const minted = await mintEventPosterUpload(clubId);
          return { signedUrl: minted.signedUrl, publicUrl: minted.publicUrl, id: minted.eventId };
        }}
        onUploaded={(_url, id) => setEventId(id)}
      />

      <EventFields values={values} set={set} disabled={() => false} error={error} />

      {override ? <OverrideReason value={reason} onChange={setReason} /> : null}

      {error && error.errors.length === 0 ? (
        <p role="alert" className="text-sm text-bad-fg">
          {error.detail ?? error.title}
        </p>
      ) : null}

      <Button type="submit" disabled={pending || scheduleBroken} className="h-11 self-start">
        Create event
      </Button>
    </form>
  );
}

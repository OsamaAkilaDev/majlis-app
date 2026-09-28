'use client';

import type {
  AssignmentList,
  EventDetail,
  EventResponsibility,
  SessionUser,
  UserSearchItem,
} from '@majlis/contracts';
import { useCallback, useEffect, useState } from 'react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { Field, focusFirstInvalid } from '@/components/Field';
import { ImageUpload } from '@/components/ImageUpload';
import { TimeRange } from '@/components/LocalTime';
import { OverrideReason } from '@/components/OverrideReason';
import { StatusBadge } from '@/components/StatusBadge';
import { UserPicker } from '@/components/UserPicker';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ProblemError } from '@/lib/api';
import { asProblem, optional, problemMessage } from '@/lib/api';
import { rebaseDraft } from '@/lib/draft';
import { enumLabel } from '@/lib/enum-label';
import { eventActionsFor } from '@/lib/event-actions';
import { canEditEventField, type EventField } from '@/lib/event-fields';
import {
  assignResponsibility,
  cancelEvent,
  getEvent,
  listAssignments,
  mintEventPosterEditUpload,
  publishEvent,
  removeAssignment,
  updateEvent,
} from '@/lib/events';
import { needsOverrideReason } from '@/lib/override';
import { useAsyncError } from '@/lib/use-async-error';
import { useList } from '@/lib/use-list';
import {
  EventFields,
  fromEvent,
  toPatchBody,
  validateSchedule,
  type EventFormValues,
} from './EventFields';

const RESPONSIBILITIES: EventResponsibility[] = ['EVENT_LEAD', 'OPERATIONS', 'MARKETING'];

function AssignPanel({
  clubId,
  eventId,
  held,
  overrideReason,
  onChanged,
}: {
  clubId: string;
  eventId: string;
  held: string[];
  overrideReason: string | undefined;
  onChanged: () => Promise<void>;
}) {
  const [picked, setPicked] = useState<UserSearchItem | null>(null);
  const [responsibility, setResponsibility] = useState<EventResponsibility>('EVENT_LEAD');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    if (!picked) return;
    setPending(true);
    setError(null);
    try {
      await assignResponsibility(eventId, { userId: picked.id, responsibility, overrideReason });
      setPicked(null);
      await onChanged();
    } catch (err) {
      setError(problemMessage(err, 'That action failed.'));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 sm:max-w-md">
      <UserPicker value={picked} onChange={setPicked} exclude={held} clubId={clubId} />
      <Field label="Responsibility" group>
        <Select
          value={responsibility}
          onValueChange={(v) => setResponsibility(v as EventResponsibility)}
        >
          {/* A SelectTrigger is a button, which no <label htmlFor> can name. */}
          <SelectTrigger aria-label="Responsibility">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RESPONSIBILITIES.map((r) => (
              <SelectItem key={r} value={r}>
                {enumLabel(r)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {error ? (
        <p role="alert" className="text-sm text-bad-fg">
          {error}
        </p>
      ) : null}
      <Button onClick={submit} disabled={pending || !picked} className="h-11 self-start">
        Assign
      </Button>
    </div>
  );
}

/** Assignments live here, not with the roster: an assignee can read the roster but must not assign. */
export function EventForm({
  eventId,
  platformRole,
  initialEvent,
  initialAssignments,
}: {
  eventId: string;
  platformRole: SessionUser['platformRole'];
  initialEvent: EventDetail | null;
  initialAssignments: AssignmentList | null;
}) {
  const [event, setEvent] = useState<EventDetail | null>(initialEvent);
  const [values, setValues] = useState<EventFormValues | null>(
    initialEvent ? fromEvent(initialEvent) : null,
  );
  const [base, setBase] = useState<EventFormValues | null>(
    initialEvent ? fromEvent(initialEvent) : null,
  );
  const { items: assignments, show: showAssignments } = useList(initialAssignments);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<ProblemError | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  // getEvent first: reading it advances the lifecycle server-side. `keep` rebases unsaved edits.
  const load = useCallback(
    async (keep?: EventFormValues) => {
      const detail = await getEvent(eventId);
      const assigned = await optional(listAssignments(eventId));
      const next = fromEvent(detail);
      setEvent(detail);
      setValues((draft) => (keep && draft ? rebaseDraft(draft, keep, next) : next));
      setBase(next);
      showAssignments(assigned);
    },
    [eventId, showAssignments],
  );

  const fail = useAsyncError();

  useEffect(() => {
    if (!initialEvent) load().catch(fail);
  }, [fail, initialEvent, load]);

  const set = useCallback(<K extends keyof EventFormValues>(key: K, value: EventFormValues[K]) => {
    setSaved(false);
    setValues((prev) => (prev ? { ...prev, [key]: value } : prev));
  }, []);

  if (!event || !values || !base) return <Skeleton className="h-96 w-full" />;

  const roles = event.viewerClubRoles;
  const can = (field: EventField) => canEditEventField(field, roles, platformRole);
  const override = needsOverrideReason(platformRole, roles);
  const overrideReason = override ? reason.trim() || undefined : undefined;
  // `new Date()` is hydration-safe: publish and cancel depend on status alone.
  const actions = eventActionsFor(event, new Date(), platformRole).map((a) => a.key);
  const scheduleBroken = Object.keys(validateSchedule(values)).length > 0;

  /** `save` replaces the draft; `rethrow` lets the caller (dialog, upload) show the failure. */
  async function act(
    fn: () => Promise<EventDetail | void>,
    { save = false, rethrow = false }: { save?: boolean; rethrow?: boolean } = {},
  ) {
    setPending(true);
    setError(null);
    try {
      await fn();
      await load(save ? undefined : (base ?? undefined));
      if (save) setSaved(true);
    } catch (err) {
      if (rethrow) throw err;
      setError(asProblem(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="font-display text-title text-ink">{event.title}</h2>
          <TimeRange
            startsAt={event.startsAt}
            endsAt={event.endsAt}
            className="tabular text-sm text-ink-2"
          />
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={event.status} />
          {actions.includes('publish') ? (
            <Button
              onClick={() => act(() => publishEvent(event.id, { overrideReason }))}
              disabled={pending}
              className="h-11"
            >
              Publish
            </Button>
          ) : null}
        </div>
      </header>

      {event.status === 'CANCELLED' && event.cancelledReason ? (
        <p role="alert" className="rounded-card bg-bad-soft px-3 py-2 text-sm text-bad-fg">
          {event.cancelledReason}
        </p>
      ) : null}

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          void act(
            async () => {
              await updateEvent(event.id, { ...toPatchBody(values, base, can), overrideReason });
            },
            { save: true },
          ).then(() => focusFirstInvalid(form));
        }}
        className="flex max-w-3xl flex-col gap-8"
      >
        {can('posterUploaded') ? (
          <ImageUpload
            kind="event-poster"
            currentUrl={event.bannerUrl}
            mint={async () => ({ ...(await mintEventPosterEditUpload(event.id)), id: event.id })}
            onUploaded={() =>
              act(() => updateEvent(event.id, { posterUploaded: true, overrideReason }), {
                rethrow: true,
              })
            }
          />
        ) : null}

        <EventFields values={values} set={set} disabled={(field) => !can(field)} error={error} />

        {override ? <OverrideReason value={reason} onChange={setReason} /> : null}

        {error && error.errors.length === 0 ? (
          <p role="alert" className="text-sm text-bad-fg">
            {error.detail ?? error.title}
          </p>
        ) : null}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending || scheduleBroken} className="h-11 self-start">
            Save changes
          </Button>
          <span aria-live="polite" className="text-sm text-ink-2 empty:hidden">
            {saved && !error ? 'Saved' : ''}
          </span>
        </div>
      </form>

      {assignments === null ? null : (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-h1 text-ink">Team</h2>
          <AssignPanel
            clubId={event.clubId}
            eventId={event.id}
            held={assignments.map((a) => a.userId)}
            overrideReason={overrideReason}
            onChanged={() => load(base)}
          />
          {assignments.length === 0 ? (
            <EmptyState title="Nobody assigned" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  <TableHead>Responsibility</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-ink">{a.userFullName}</span>
                        <span className="text-label text-ink-2">{a.userEmail}</span>
                      </div>
                    </TableCell>
                    <TableCell>{enumLabel(a.responsibility)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <ConfirmDialog
                          title={`Remove ${a.userFullName} from this event?`}
                          confirmLabel="Remove"
                          destructive
                          trigger={
                            <Button
                              variant="destructive"
                              size="sm"
                              className="h-11"
                              aria-label={`Remove ${a.userFullName}`}
                            >
                              Remove
                            </Button>
                          }
                          onConfirm={() =>
                            act(() => removeAssignment(event.id, a.id, { overrideReason }), {
                              rethrow: true,
                            })
                          }
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      )}

      {actions.includes('cancel') ? (
        <div className="border-t border-border pt-6">
          <ConfirmDialog
            title={`Cancel ${event.title}?`}
            confirmLabel="Cancel event"
            destructive
            reason="required"
            trigger={
              <Button variant="destructive" disabled={pending} className="h-11">
                Cancel event
              </Button>
            }
            onConfirm={(why) =>
              act(() => cancelEvent(event.id, { reason: why ?? '' }), { rethrow: true })
            }
          />
        </div>
      ) : null}
    </div>
  );
}

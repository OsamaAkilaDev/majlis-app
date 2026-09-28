'use client';

import type {
  AttendanceMethod,
  AttendanceList,
  EventDetail,
  RegistrationList,
  SessionUser,
} from '@majlis/contracts';
import { useCallback, useEffect, useState } from 'react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { Moment } from '@/components/LocalTime';
import { OverrideReason } from '@/components/OverrideReason';
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
import { optional } from '@/lib/api';
import { correctAttendance, listAttendance } from '@/lib/attendance';
import { getEvent, listRoster } from '@/lib/events';
import { needsOverrideReason } from '@/lib/override';
import { useAsyncError } from '@/lib/use-async-error';
import { useList } from '@/lib/use-list';

const METHOD: Record<AttendanceMethod, string> = { MANUAL: 'Manual' };

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-h1 text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** A screen of its own because event assignees may reach this and not the edit form. */
export function EventAttendees({
  eventId,
  platformRole,
  initialEvent,
  initialRoster,
  initialAttendance,
}: {
  eventId: string;
  platformRole: SessionUser['platformRole'];
  initialEvent: EventDetail | null;
  initialRoster: RegistrationList | null;
  initialAttendance: AttendanceList | null;
}) {
  const [event, setEvent] = useState<EventDetail | null>(initialEvent);
  const { items: roster, show: showRoster } = useList(initialRoster);
  const { items: attendance, show: showAttendance } = useList(initialAttendance);
  // Whole-event totals, so kept outside the list state.
  const [counts, setCounts] = useState<{ checkedIn: number; expected: number } | null>(
    initialAttendance
      ? { checkedIn: initialAttendance.checkedIn, expected: initialAttendance.expected }
      : null,
  );
  const [reason, setReason] = useState('');

  // getEvent first: reading it advances the lifecycle server-side, which the other two reads depend on.
  // A 403 on a section means the viewer lacks that permission, so it is hidden.
  const load = useCallback(async () => {
    const detail = await getEvent(eventId);
    const [registered, attended] = await Promise.all([
      optional(listRoster(eventId)),
      optional(listAttendance(eventId)),
    ]);
    setEvent(detail);
    showRoster(registered);
    showAttendance(attended);
    setCounts(attended ? { checkedIn: attended.checkedIn, expected: attended.expected } : null);
  }, [eventId, showRoster, showAttendance]);

  const fail = useAsyncError();

  useEffect(() => {
    if (!initialEvent) load().catch(fail);
  }, [fail, initialEvent, load]);

  if (!event) return <Skeleton className="h-96 w-full" />;

  const roles = event.viewerClubRoles;
  const override = needsOverrideReason(platformRole, roles);
  const overrideReason = override ? reason.trim() || undefined : undefined;
  // Mirrors 'attendance:correct'; an event assignment grants check-in, never correction.
  const canCorrect =
    platformRole === 'ADMIN' || roles.includes('LEAD') || roles.includes('OPERATIONS');

  async function correct(registrationId: string, present: boolean, why: string | undefined) {
    await correctAttendance(eventId, registrationId, {
      present,
      reason: why ?? '',
      ...(overrideReason ? { override: { reason: overrideReason } } : {}),
    });
    await load();
  }

  return (
    <div className="flex flex-col gap-10">
      {/* Labelled apart from the edit form's own override reason stacked above it. */}
      {override ? (
        <OverrideReason
          value={reason}
          onChange={setReason}
          label="Override reason for a correction"
        />
      ) : null}

      {roster === null ? null : (
        <Section title="Registrations">
          {roster.length === 0 ? (
            <EmptyState title="Nobody registered" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Waitlist</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roster.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-ink">{r.userFullName}</span>
                        <span className="text-label text-ink-2">{r.userEmail}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                    </TableCell>
                    <TableCell className="tabular text-ink-2">{r.waitlistPosition ?? ''}</TableCell>
                    <TableCell className="text-ink-2">
                      {r.source === 'ADMIN_OVERRIDE' ? 'Admin override' : 'Self'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Section>
      )}

      {attendance === null ? null : (
        <Section
          title="Attendance"
          action={
            counts ? (
              <span className="tabular text-h1 text-ink">
                {counts.checkedIn} / {counts.expected}
              </span>
            ) : undefined
          }
        >
          {attendance.length === 0 ? (
            <EmptyState title="Nobody registered" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Checked in</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attendance.map((row) => {
                  // The attendance record, not the registration status, which lags a correction.
                  const present = row.checkedInAt !== null;
                  return (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-ink">{row.fullName}</span>
                          <span className="selectable text-label text-ink-2">{row.email}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={row.registrationStatus} />
                      </TableCell>
                      <TableCell className="tabular text-ink-2">
                        {row.checkedInAt ? <Moment at={row.checkedInAt} /> : null}
                      </TableCell>
                      <TableCell className="text-ink-2">
                        {row.method ? METHOD[row.method] : ''}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          {canCorrect ? (
                            <ConfirmDialog
                              title={`Mark ${row.fullName} ${present ? 'absent' : 'present'}?`}
                              confirmLabel={present ? 'Mark absent' : 'Mark present'}
                              destructive={present}
                              reason="required"
                              trigger={
                                <Button
                                  size="sm"
                                  variant={present ? 'destructive' : 'outline'}
                                  className="h-11"
                                >
                                  {present ? 'Mark absent' : 'Mark present'}
                                </Button>
                              }
                              onConfirm={(why) => correct(row.id, !present, why)}
                            />
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Section>
      )}
    </div>
  );
}

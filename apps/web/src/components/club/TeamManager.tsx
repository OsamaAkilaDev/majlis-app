'use client';

import type { AppointmentList, ClubDetail, ClubRole } from '@majlis/contracts';
import { useCallback, useEffect, useState } from 'react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { useShellSession } from '@/components/shell/shell-session';
import { UserPickerDialog } from '@/components/UserPickerDialog';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/Field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { clubSectionsFor } from '@/lib/club-sections';
import { endAppointment, getClub, inviteTeamMember, listTeam } from '@/lib/clubs';
import { enumLabel } from '@/lib/enum-label';
import { formatDay } from '@/lib/event-time';
import { useList } from '@/lib/use-list';
import { useAsyncError } from '@/lib/use-async-error';

type InvitableRole = 'VICE_LEAD' | 'MARKETING' | 'CTO' | 'OPERATIONS';
const INVITABLE_ROLES: ClubRole[] = ['VICE_LEAD', 'MARKETING', 'CTO', 'OPERATIONS'];

function InviteDialog({ clubId, onInvited }: { clubId: string; onInvited: () => void }) {
  // Only the picker and error reset on close; the chosen role stays.
  const [role, setRole] = useState<ClubRole>('VICE_LEAD');

  return (
    <UserPickerDialog
      trigger={<Button className="h-11">Invite</Button>}
      title="Invite a team member"
      confirmLabel="Send invitation"
      clubId={clubId}
      onSubmit={async (user) => {
        await inviteTeamMember(clubId, { userId: user.id, role: role as InvitableRole });
        onInvited();
      }}
    >
      <Field label="Role" group>
        <Select value={role} onValueChange={(v) => setRole(v as ClubRole)}>
          <SelectTrigger aria-label="Role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {INVITABLE_ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {enumLabel(r)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </UserPickerDialog>
  );
}

export function TeamManager({
  clubId,
  viewerUserId,
  initialClub,
  initialTeam,
}: {
  clubId: string;
  viewerUserId: string;
  initialClub: ClubDetail | null;
  initialTeam: AppointmentList | null;
}) {
  const [club, setClub] = useState<ClubDetail | null>(initialClub);
  const { user } = useShellSession();
  const { items, show } = useList(initialTeam);

  const load = useCallback(async () => {
    const [c, team] = await Promise.all([getClub(clubId), listTeam(clubId)]);
    setClub(c);
    show(team);
  }, [clubId, show]);

  const seeded = initialClub !== null && initialTeam !== null;
  const fail = useAsyncError();

  useEffect(() => {
    if (!seeded) load().catch(fail);
  }, [seeded, load, fail]);

  if (!club || items === null) return <Skeleton className="h-64 w-full" />;

  // `club:team-manage`: the Lead, or an Admin.
  const isLead = clubSectionsFor(club.viewerClubRoles, user.platformRole).some(
    (s) => s.key === 'team',
  );

  return (
    <div className="flex flex-col gap-4">
      {isLead ? (
        <div className="flex justify-end">
          <InviteDialog clubId={clubId} onInvited={load} />
        </div>
      ) : null}

      {items.length === 0 ? (
        <EmptyState title="No team appointments" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Person</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((a) => (
              <TableRow key={a.id}>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium text-ink">{a.userFullName}</span>
                    {a.userEmail ? <span className="text-label text-ink-2">{a.userEmail}</span> : null}
                  </div>
                </TableCell>
                <TableCell>{enumLabel(a.role)}</TableCell>
                <TableCell className="flex items-center gap-2">
                  <StatusBadge status={a.status} />
                  {a.hasLeftClub ? <StatusBadge status="LEFT" className="opacity-70" /> : null}
                </TableCell>
                <TableCell className="tabular text-ink-2">
                  {a.invitationExpiresAt ? formatDay(a.invitationExpiresAt) : ''}
                </TableCell>
                <TableCell>
                  {isLead && a.status === 'ACTIVE' && a.userId !== viewerUserId ? (
                    <ConfirmDialog
                      trigger={
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-11"
                          aria-label={`End ${a.userFullName}'s appointment`}
                        >
                          End
                        </Button>
                      }
                      title={`End ${a.userFullName}'s appointment?`}
                      confirmLabel="End appointment"
                      destructive
                      reason="required"
                      onConfirm={(reason) => endAppointment(clubId, a.id, { reason: reason ?? '' }).then(load)}
                    />
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

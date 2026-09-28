'use client';

import type { ClubDetail, MemberList } from '@majlis/contracts';
import { useCallback, useEffect, useState } from 'react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { useShellSession } from '@/components/shell/shell-session';
import { UserPickerDialog } from '@/components/UserPickerDialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { clubSectionsFor } from '@/lib/club-sections';
import { addMember, decideMembership, getClub, listMembers, removeMember } from '@/lib/clubs';
import { formatDay } from '@/lib/event-time';
import { useList } from '@/lib/use-list';
import { useAsyncError } from '@/lib/use-async-error';

function AddMemberDialog({ clubId, onAdded }: { clubId: string; onAdded: () => void }) {
  return (
    <UserPickerDialog
      trigger={<Button className="h-11">Add member</Button>}
      title="Add a member"
      confirmLabel="Add"
      clubId={clubId}
      onSubmit={async (user) => {
        await addMember(clubId, { userId: user.id });
        onAdded();
      }}
    />
  );
}

export function MembersManager({
  clubId,
  initialClub,
  initialPending,
  initialActive,
}: {
  clubId: string;
  initialClub: ClubDetail | null;
  initialPending: MemberList | null;
  initialActive: MemberList | null;
}) {
  const [club, setClub] = useState<ClubDetail | null>(initialClub);
  const { user } = useShellSession();
  const { items: pending, show: showPending } = useList(initialPending);
  const { items: active, show: showActive } = useList(initialActive);

  const load = useCallback(async () => {
    const [c, pendingList, activeList] = await Promise.all([
      getClub(clubId),
      listMembers(clubId, { status: 'PENDING' }),
      listMembers(clubId, { status: 'ACTIVE' }),
    ]);
    setClub(c);
    showPending(pendingList);
    showActive(activeList);
  }, [clubId, showPending, showActive]);

  const seeded = initialClub !== null && initialPending !== null && initialActive !== null;
  const fail = useAsyncError();

  useEffect(() => {
    if (!seeded) load().catch(fail);
  }, [seeded, load, fail]);

  if (!club || pending === null || active === null) return <Skeleton className="h-64 w-full" />;

  const canDecide = clubSectionsFor(club.viewerClubRoles, user.platformRole).some(
    (s) => s.key === 'members',
  );

  async function decide(requestId: string, status: 'ACTIVE' | 'REJECTED', reason?: string) {
    await decideMembership(clubId, requestId, { status, reason });
    await load();
  }

  async function remove(userId: string) {
    await removeMember(clubId, userId);
    await load();
  }

  return (
    <div className="flex flex-col gap-8">
      {canDecide ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-h2 text-ink">Requests</h2>
          {pending.length === 0 ? (
            <EmptyState title="No pending requests" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-ink">{m.userFullName}</span>
                        {m.userEmail ? <span className="text-label text-ink-2">{m.userEmail}</span> : null}
                      </div>
                    </TableCell>
                    <TableCell className="tabular text-ink-2">{formatDay(m.requestedAt)}</TableCell>
                    <TableCell>
                      {/* h-11 on every control here: `sm` alone is a 28px touch target. */}
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          className="h-11"
                          onClick={() => decide(m.id, 'ACTIVE').catch(fail)}
                          aria-label={`Approve ${m.userFullName}`}
                        >
                          Approve
                        </Button>
                        <ConfirmDialog
                          trigger={
                            <Button
                              variant="destructive"
                              size="sm"
                              className="h-11"
                              aria-label={`Reject ${m.userFullName}`}
                            >
                              Reject
                            </Button>
                          }
                          title={`Reject ${m.userFullName}'s request?`}
                          confirmLabel="Reject"
                          destructive
                          reason="optional"
                          onConfirm={(reason) => decide(m.id, 'REJECTED', reason)}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-h2 text-ink">Members</h2>
          {canDecide ? <AddMemberDialog clubId={clubId} onAdded={load} /> : null}
        </div>
        {active.length === 0 ? (
          <EmptyState title="No members" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {active.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium text-ink">{m.userFullName}</span>
                      {m.userEmail ? <span className="text-label text-ink-2">{m.userEmail}</span> : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    {/* Not on your own row: leaving is the club page's Leave control. */}
                    {canDecide && m.userId !== user.id ? (
                      <ConfirmDialog
                        trigger={
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-11"
                            aria-label={`Remove ${m.userFullName}`}
                          >
                            Remove
                          </Button>
                        }
                        title={`Remove ${m.userFullName}?`}
                        confirmLabel="Remove"
                        destructive
                        onConfirm={() => remove(m.userId)}
                      />
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}

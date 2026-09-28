'use client';

import type { UserListItem, UserList, UserStatus } from '@majlis/contracts';
import { useState } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { Field } from '@/components/Field';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
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
import { Textarea } from '@/components/ui/textarea';
import type { ProblemError } from '@/lib/api';
import { asProblem } from '@/lib/api';
import { listUsers, updateUser, updateUserStatus } from '@/lib/clubs';
import { enumLabel } from '@/lib/enum-label';
import { formatDay } from '@/lib/event-time';
import { useList } from '@/lib/use-list';

/** The status the action on a row moves it to. */
const flip = (status: UserStatus): UserStatus => (status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE');

/** Mounted per row with `key={user.id}`, so another row never inherits a half-typed reason. */
function StatusDialog({
  user,
  onClose,
  onChanged,
}: {
  user: UserListItem;
  onClose: () => void;
  onChanged: (id: string, status: UserStatus) => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<ProblemError | null>(null);
  const [pending, setPending] = useState(false);

  const next = flip(user.status);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const updated = await updateUserStatus(user.id, { status: next, reason });
      onChanged(user.id, updated.status);
      onClose();
    } catch (err) {
      setError(asProblem(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {next === 'SUSPENDED' ? 'Suspend' : 'Reactivate'} {user.fullName}
          </DialogTitle>
        </DialogHeader>

        <Field label="Reason" error={error?.fieldError('reason')}>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} required />
        </Field>

        {error && error.errors.length === 0 ? (
          <p role="alert" className="text-sm text-bad-fg">{error.detail ?? error.title}</p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !reason.trim()}>
            {next === 'SUSPENDED' ? 'Suspend' : 'Reactivate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const ROLES: UserListItem['platformRole'][] = ['STUDENT', 'ADMIN'];

/** Keyed on the row like StatusDialog. */
function EditDialog({
  user,
  isSelf,
  onClose,
  onSaved,
}: {
  user: UserListItem;
  isSelf: boolean;
  onClose: () => void;
  onSaved: (id: string, patch: Partial<UserListItem>) => void;
}) {
  const [fullName, setFullName] = useState(user.fullName);
  const [email, setEmail] = useState(user.email);
  const [platformRole, setPlatformRole] = useState(user.platformRole);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<ProblemError | null>(null);
  const [pending, setPending] = useState(false);

  // Only changed fields: a no-op save would still write an audit row and, for email, revoke sessions.
  const patch = {
    ...(fullName !== user.fullName ? { fullName } : {}),
    ...(email !== user.email ? { email } : {}),
    ...(platformRole !== user.platformRole ? { platformRole } : {}),
  };
  const dirty = Object.keys(patch).length > 0;

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const updated = await updateUser(user.id, { ...patch, reason });
      onSaved(user.id, {
        fullName: updated.fullName,
        email: updated.email,
        platformRole: updated.platformRole,
      });
      onClose();
    } catch (err) {
      setError(asProblem(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {user.fullName}</DialogTitle>
        </DialogHeader>

        <Field label="Full name" error={error?.fieldError('fullName')}>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </Field>

        <Field label="Email" error={error?.fieldError('email')}>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>

        <Field label="Platform role" error={error?.fieldError('platformRole')} group>
          <Select
            value={platformRole}
            onValueChange={(v) => setPlatformRole(v as UserListItem['platformRole'])}
            disabled={isSelf}
          >
            <SelectTrigger aria-label="Platform role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {enumLabel(r)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Reason" error={error?.fieldError('reason')}>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} required />
        </Field>

        {error && error.errors.length === 0 ? (
          <p role="alert" className="text-sm text-bad-fg">{error.detail ?? error.title}</p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !dirty || !reason.trim()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function UsersManager({
  viewerId,
  initialUsers,
}: {
  viewerId: string;
  initialUsers: UserList | null;
}) {
  const [target, setTarget] = useState<UserListItem | null>(null);
  const [editing, setEditing] = useState<UserListItem | null>(null);
  const { items, setItems } = useList(initialUsers, () => listUsers({}), { deps: [] });

  /** Patches the one row in place: a refetch would lose the reader's scroll. */
  function applyPatch(id: string, patch: Partial<UserListItem>) {
    setItems((prev) => prev?.map((u) => (u.id === id ? { ...u, ...patch } : u)) ?? prev);
  }

  const applyStatus = (id: string, status: UserStatus) => applyPatch(id, { status });

  return (
    <div className="flex flex-col gap-4">
      {items === null ? (
        <Skeleton className="h-40 w-full" />
      ) : items.length === 0 ? (
        <EmptyState title="No users found" />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <span className="flex flex-col">
                      <span className="font-medium text-ink">{u.fullName}</span>
                      <span className="selectable text-label text-ink-2">{u.email}</span>
                    </span>
                  </TableCell>
                  <TableCell>{enumLabel(u.platformRole)}</TableCell>
                  <TableCell>
                    <StatusBadge status={u.status} />
                  </TableCell>
                  {/* To the day in UTC: a locale format differs between server and browser, a hydration mismatch. */}
                  <TableCell className="tabular">{formatDay(u.createdAt)}</TableCell>
                  <TableCell>
                    <span className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setEditing(u)}
                        aria-label={`Edit ${u.fullName}`}
                      >
                        Edit
                      </Button>
                      {/* The API refuses an admin changing their own status or role; hiding this is presentation only. */}
                      {u.id === viewerId ? (
                        <span className="self-center text-sm text-ink-3">You</span>
                      ) : (
                        <Button
                          variant="outline"
                          onClick={() => setTarget(u)}
                          aria-label={`${u.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'} ${u.fullName}`}
                        >
                          {u.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
                        </Button>
                      )}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}

      {target ? (
        <StatusDialog
          key={target.id}
          user={target}
          onClose={() => setTarget(null)}
          onChanged={applyStatus}
        />
      ) : null}

      {editing ? (
        <EditDialog
          key={editing.id}
          user={editing}
          isSelf={editing.id === viewerId}
          onClose={() => setEditing(null)}
          onSaved={applyPatch}
        />
      ) : null}
    </div>
  );
}

'use client';

import type { UserSearchItem } from '@majlis/contracts';
import { useEffect, useState } from 'react';
import { Field } from '@/components/Field';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import { listUsers, searchClubUsers } from '@/lib/clubs';
import { useAsyncError } from '@/lib/use-async-error';

/** The club-scoped route refuses shorter queries. */
const MIN_QUERY = 2;

const SHOWN = 20;

/** With `clubId`, the officer-held `user:search` route; without, the Admin-only `GET /users`. */
export function UserPicker({
  value,
  onChange,
  exclude = [],
  clubId,
}: {
  value: UserSearchItem | null;
  onChange: (user: UserSearchItem) => void;
  exclude?: string[];
  clubId?: string;
}) {
  const [users, setUsers] = useState<UserSearchItem[]>([]);
  const [q, setQ] = useState('');
  const fail = useAsyncError();

  // Search server-side; filtering one fetched page in the browser misses later accounts.
  useEffect(() => {
    const needle = q.trim();
    if (clubId && needle.length < MIN_QUERY) {
      setUsers([]);
      return;
    }
    // `live` drops a stale query's result so it cannot overwrite a newer one.
    let live = true;
    const timer = setTimeout(
      () => {
        const page = clubId
          ? searchClubUsers(clubId, needle)
          : listUsers({ q: needle || undefined });
        page
          .then((p) => {
            if (live) setUsers(p.items);
          })
          .catch(fail);
      },
      needle ? 200 : 0,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [clubId, q, fail]);

  const candidates = users.filter((u) => !exclude.includes(u.id));

  return (
    <div className="flex flex-col gap-2">
      <Field label="Search">
        <Input value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
      </Field>
      <ul className="max-h-40 overflow-y-auto rounded-control border border-border-control">
        {candidates.slice(0, SHOWN).map((u) => (
          <li key={u.id}>
            <button
              type="button"
              onClick={() => onChange(u)}
              aria-pressed={value?.id === u.id}
              className={cn(
                'flex w-full flex-col items-start gap-0 px-2.5 py-1.5 text-left text-sm hover:bg-surface-2',
                value?.id === u.id && 'bg-primary-soft text-primary-soft-fg',
              )}
            >
              <span>{u.fullName}</span>
              <span className="text-label text-ink-2">{u.email}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

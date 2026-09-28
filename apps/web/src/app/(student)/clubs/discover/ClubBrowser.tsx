'use client';

import type { ClubList, ClubSummary } from '@majlis/contracts';
import { Check } from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import { EmptyState } from '@/components/EmptyState';
import { Badge } from '@/components/StatusBadge';
import { Skeleton } from '@/components/ui/skeleton';
import { listClubs } from '@/lib/clubs';
import { useList } from '@/lib/use-list';

function ClubCard({ club }: { club: ClubSummary }) {
  return (
    <Link
      href={`/clubs/${club.slug}`}
      className="flex h-full items-center gap-3 rounded-card border border-border bg-surface p-3 transition-colors duration-(--dur-fast) ease-(--ease-out) hover:bg-surface-2"
    >
      <img src={club.logoUrl} alt="" className="size-12 shrink-0 rounded-control border border-border bg-surface-2 object-cover" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-ink">{club.name}</span>
        <span className="block truncate text-sm text-ink-2">{club.category}</span>
      </span>
      {club.viewerJoined ? <Badge tone="ok" label="Joined" icon={Check} /> : null}
      <span className="shrink-0 text-sm tabular-nums text-ink-2">{club.memberCount}</span>
    </Link>
  );
}

export function ClubBrowser({ initialClubs }: { initialClubs: ClubList | null }) {
  const { items } = useList(
    initialClubs,
    () => listClubs({ status: 'ACTIVE', joinable: true }),
    { deps: [] },
  );

  return (
    <div className="flex flex-col gap-4">
      {items === null ? (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-[4.5rem]" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState title="No clubs found" />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((club) => (
            <li key={club.id}>
              <ClubCard club={club} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

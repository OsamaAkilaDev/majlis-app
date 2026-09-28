'use client';

import type { ClubList } from '@majlis/contracts';
import { Plus } from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import { EmptyState } from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { listClubs } from '@/lib/clubs';
import { useList } from '@/lib/use-list';

export function ClubsManager({ initialClubs }: { initialClubs: ClubList | null }) {
  const { items } = useList(initialClubs, () => listClubs({}), { deps: [] });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button asChild>
          <Link href="/admin/clubs/new">
            <Plus data-icon="inline-start" aria-hidden />
            New club
          </Link>
        </Button>
      </div>

      {items === null ? (
        <Skeleton className="h-40 w-full" />
      ) : items.length === 0 ? (
        <EmptyState title="No clubs" />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Club</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Members</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`/manage/${c.id}/overview`} className="flex items-center gap-2 font-medium text-ink hover:underline">
                      <img src={c.logoUrl} alt="" className="size-6 shrink-0 rounded-control border border-border object-cover" />
                      {c.name}
                    </Link>
                  </TableCell>
                  <TableCell>{c.departmentName}</TableCell>
                  <TableCell>
                    <StatusBadge status={c.status} />
                  </TableCell>
                  <TableCell className="tabular">{c.memberCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  );
}

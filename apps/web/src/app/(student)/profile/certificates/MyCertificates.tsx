'use client';

import type { CertificateList } from '@majlis/contracts';
import Link from 'next/link';
import { EmptyState } from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { myCertificates } from '@/lib/certificates';
import { formatDay } from '@/lib/event-time';
import { useList } from '@/lib/use-list';

export function MyCertificates({ initial }: { initial: CertificateList | null }) {
  const { items } = useList(
    initial,
    () => myCertificates(),
    { deps: [] },
  );
  if (items === null) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title="No certificates yet"
        action={
          <Button asChild>
            <Link href="/events/discover">Browse events</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="grid gap-2 lg:grid-cols-2">
        {items.map((certificate) => (
          <li
            key={certificate.id}
            className="flex h-full flex-col gap-2 rounded-card border border-border bg-surface p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                {/* Snapshot fields, so a later rename cannot alter an issued certificate. */}
                <span className="block truncate font-semibold text-ink">
                  {certificate.eventTitle}
                </span>
                <span className="block truncate text-sm text-ink-2">{certificate.clubName}</span>
              </div>
              <StatusBadge status={certificate.status} />
            </div>

            <p className="tabular text-sm text-ink-2">{formatDay(certificate.issuedAt)}</p>

            <span className="tabular selectable mt-auto text-label text-ink-3">
              {certificate.serialNumber}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

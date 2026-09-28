'use client';

import type { AuditEntry, AuditList } from '@majlis/contracts';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Moment } from '@/components/LocalTime';
import { useList } from '@/lib/use-list';

function shortId(id: string): string {
  return id.slice(0, 8);
}

function Outcome({ outcome }: { outcome: AuditEntry['outcome'] }) {
  const ok = outcome === 'SUCCESS';
  return (
    <span
      className={
        ok
          ? 'rounded-full bg-ok-soft px-2 py-0.5 text-label font-semibold text-ok-fg'
          : 'rounded-full bg-bad-soft px-2 py-0.5 text-label font-semibold text-bad-fg'
      }
    >
      {ok ? 'Success' : 'Denied'}
    </span>
  );
}

/** Read-only. Timestamps render in UTC so server and browser hydrate identically. */
export function AuditTable({
  initial,
  fetchList,
}: {
  initial: AuditList | null;
  fetchList: () => Promise<AuditList>;
}) {
  const { items } = useList(initial, fetchList, { deps: [] });

  return (
    <div className="flex flex-col gap-4">
      {items === null ? (
        <Skeleton className="h-40 w-full" />
      ) : items.length === 0 ? (
        <EmptyState title="No audit entries" />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When (UTC)</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="tabular whitespace-nowrap text-ink-2">
                    <Moment at={entry.createdAt} />
                  </TableCell>
                  <TableCell className="font-medium text-ink">{entry.action}</TableCell>
                  <TableCell className="text-ink-2">
                    {entry.entityType}
                    <span
                      className="tabular selectable block text-label text-ink-3"
                      title={entry.entityId}
                    >
                      {shortId(entry.entityId)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Outcome outcome={entry.outcome} />
                  </TableCell>
                  <TableCell className="tabular text-ink-2">
                    {/* AuditLog has no foreign keys, so the actor is a bare id. */}
                    {entry.actorUserId ? (
                      <span className="selectable" title={entry.actorUserId}>
                        {shortId(entry.actorUserId)}
                      </span>
                    ) : (
                      'System'
                    )}
                  </TableCell>
                  <TableCell>
                    <details className="max-w-md">
                      <summary className="cursor-pointer text-sm text-primary">Detail</summary>
                      {entry.reason ? (
                        <p className="mt-1 text-sm text-ink-2">{entry.reason}</p>
                      ) : null}
                      <pre className="selectable mt-1 overflow-x-auto rounded-control bg-surface-2 p-2 text-label text-ink-2">
                        {JSON.stringify(
                          {
                            before: entry.before,
                            after: entry.after,
                            requestId: entry.requestId,
                            ip: entry.ip,
                          },
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  );
}

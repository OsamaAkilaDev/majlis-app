'use client';

import type { Certificate } from '@majlis/contracts';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { problemMessage } from '@/lib/api';
import { eventCertificates, issueCertificates, revokeCertificate } from '@/lib/certificates';
import { formatDay } from '@/lib/event-time';
import { useList } from '@/lib/use-list';

/** `certificate:manage` covers listing and acting alike, so a viewer who sees the list gets the controls. */
export function EventCertificates({ eventId }: { eventId: string }) {
  const { items, show } = useList<Certificate>(
    null,
    () => eventCertificates(eventId),
    { deps: [eventId] },
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState('');

  // Awaited after an action, so a ConfirmDialog closes on the fresh list.
  async function load() {
    show(await eventCertificates(eventId));
  }

  async function issue() {
    setPending(true);
    setError(null);
    try {
      const result = await issueCertificates(eventId);
      // A second press is a no-op, so show counts to tell it from a failure.
      setIssued(`Issued ${result.issued}. ${result.total} active.`);
      await load();
    } catch (err) {
      setIssued('');
      setError(problemMessage(err, 'That action failed.'));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={issue} disabled={pending}>
          Issue certificates
        </Button>
        <span aria-live="polite" className="tabular text-sm text-ink-2 empty:hidden">
          {issued}
        </span>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-bad-fg">
          {error}
        </p>
      ) : null}

      {items === null ? (
        <Skeleton className="h-40 w-full" />
      ) : items.length === 0 ? (
        <EmptyState title="No certificates issued" />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Holder</TableHead>
                <TableHead>Serial</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((certificate) => (
                <TableRow key={certificate.id}>
                  <TableCell className="font-medium text-ink">{certificate.holderName}</TableCell>
                  <TableCell className="tabular selectable text-ink-2">
                    {certificate.serialNumber}
                  </TableCell>
                  <TableCell className="tabular text-ink-2">
                    {formatDay(certificate.issuedAt)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={certificate.status} />
                  </TableCell>
                  <TableCell>
                    {/* onConfirm throws on purpose: ConfirmDialog shows the error and stays open. */}
                    <div className="flex justify-end gap-2">
                      {certificate.status === 'ACTIVE' ? (
                        <ConfirmDialog
                          title={`Revoke ${certificate.holderName}'s certificate?`}
                          confirmLabel="Revoke"
                          destructive
                          reason="required"
                          trigger={
                            <Button
                              size="sm"
                              variant="destructive"
                              aria-label={`Revoke ${certificate.holderName}'s certificate`}
                            >
                              Revoke
                            </Button>
                          }
                          onConfirm={async (why) => {
                            await revokeCertificate(certificate.id, { reason: why ?? '' });
                            await load();
                          }}
                        />
                      ) : null}
                    </div>
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

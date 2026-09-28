import type { AuditList } from '@majlis/contracts';
import type { Metadata } from 'next';
import { ConsoleShell } from '@/components/shell/ConsoleShell';
import { serverFetch } from '@/lib/server-api';
import { AdminAudit } from './AdminAudit';

export const metadata: Metadata = { title: 'Audit' };

export default async function AdminAuditPage() {
  const initial = await serverFetch<AuditList>(`/audit`);

  return (
    <ConsoleShell title="Audit">
      <AdminAudit initial={initial} />
    </ConsoleShell>
  );
}

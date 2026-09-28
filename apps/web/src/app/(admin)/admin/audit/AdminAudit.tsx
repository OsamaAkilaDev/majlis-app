'use client';

import type { AuditList } from '@majlis/contracts';
import { AuditTable } from '@/components/AuditTable';
import { listAudit } from '@/lib/reporting';

export function AdminAudit({ initial }: { initial: AuditList | null }) {
  return <AuditTable initial={initial} fetchList={listAudit} />;
}

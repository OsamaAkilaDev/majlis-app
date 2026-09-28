import type { DepartmentList } from '@majlis/contracts';
import type { Metadata } from 'next';
import { ConsoleShell } from '@/components/shell/ConsoleShell';
import { serverFetch } from '@/lib/server-api';
import { DepartmentsManager } from './DepartmentsManager';

export const metadata: Metadata = { title: 'Departments' };

export default async function DepartmentsPage() {
  const initial = await serverFetch<DepartmentList>(`/departments`);

  return (
    <ConsoleShell title="Departments">
      <DepartmentsManager initial={initial} />
    </ConsoleShell>
  );
}

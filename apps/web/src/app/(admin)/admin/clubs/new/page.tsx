import type { DepartmentList } from '@majlis/contracts';
import type { Metadata } from 'next';
import { ConsoleShell } from '@/components/shell/ConsoleShell';
import { serverFetch } from '@/lib/server-api';
import { ClubCreateForm } from './ClubCreateForm';

export const metadata: Metadata = { title: 'New club' };

export default async function NewClubPage() {
  const departments = await serverFetch<DepartmentList>('/departments');

  return (
    <ConsoleShell title="New club">
      <ClubCreateForm initialDepartments={departments?.items ?? null} />
    </ConsoleShell>
  );
}

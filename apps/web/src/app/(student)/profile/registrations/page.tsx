import type { MyRegistrationList } from '@majlis/contracts';
import type { Metadata } from 'next';
import { StudentShell } from '@/components/shell/StudentShell';
import { serverFetch } from '@/lib/server-api';
import { RegistrationsManager } from './RegistrationsManager';

export const metadata: Metadata = { title: 'My registrations' };

export default async function MyRegistrationsPage() {
  const initial = await serverFetch<MyRegistrationList>(`/me/registrations`);

  return (
    <StudentShell title="My registrations">
      <RegistrationsManager initial={initial} />
    </StudentShell>
  );
}

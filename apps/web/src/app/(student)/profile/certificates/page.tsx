import type { CertificateList } from '@majlis/contracts';
import type { Metadata } from 'next';
import { StudentShell } from '@/components/shell/StudentShell';
import { serverFetch } from '@/lib/server-api';
import { MyCertificates } from './MyCertificates';

export const metadata: Metadata = { title: 'My certificates' };

export default async function MyCertificatesPage() {
  const initial = await serverFetch<CertificateList>(`/me/certificates`);

  return (
    <StudentShell title="My certificates">
      <MyCertificates initial={initial} />
    </StudentShell>
  );
}

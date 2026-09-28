import type { ClubList } from '@majlis/contracts';
import type { Metadata } from 'next';
import { StudentShell } from '@/components/shell/StudentShell';
import { serverFetch } from '@/lib/server-api';
import { ClubBrowser } from './ClubBrowser';

export const metadata: Metadata = { title: 'Discover clubs' };

export default async function ClubsPage() {
  const clubs = await serverFetch<ClubList>('/clubs?status=ACTIVE&joinable=true');

  return (
    <StudentShell title="Discover">
      <ClubBrowser initialClubs={clubs} />
    </StudentShell>
  );
}

import type { ClubList } from '@majlis/contracts';
import type { Metadata } from 'next';
import { ConsoleShell } from '@/components/shell/ConsoleShell';
import { serverFetch } from '@/lib/server-api';
import { ClubsManager } from './ClubsManager';

export const metadata: Metadata = { title: 'Clubs' };

export default async function ClubsPage() {
  const clubs = await serverFetch<ClubList>('/clubs');

  return (
    <ConsoleShell title="Clubs">
      <ClubsManager initialClubs={clubs} />
    </ConsoleShell>
  );
}

import type { InvitationList, MyClubList } from '@majlis/contracts';
import type { Metadata } from 'next';
import { SearchLink } from '@/components/shell/SearchLink';
import { StudentShell } from '@/components/shell/StudentShell';
import { serverFetch } from '@/lib/server-api';
import { ClubGroups } from './ClubGroups';

export const metadata: Metadata = { title: 'Clubs' };

export default async function ClubsPage() {
  const [clubs, invitations] = await Promise.all([
    serverFetch<MyClubList>(`/me/clubs`),
    serverFetch<InvitationList>(`/me/invitations`),
  ]);

  return (
    <StudentShell title="Clubs" action={<SearchLink href="/clubs/discover" label="Find a club" />}>
      <ClubGroups initial={clubs} initialInvitations={invitations?.items ?? null} />
    </StudentShell>
  );
}

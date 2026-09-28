import type { MemberList } from '@majlis/contracts';
import type { Metadata } from 'next';
import { MembersManager } from '@/components/club/MembersManager';
import { StudentShell } from '@/components/shell/StudentShell';
import { requireClub } from '@/lib/officer-access';
import { serverFetch } from '@/lib/server-api';

export const metadata: Metadata = { title: 'Members' };

export default async function ClubMembersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { club } = await requireClub(slug);

  // Sequential: the slug resolves to the club id first.
  const [pending, active] = await Promise.all([
    serverFetch<MemberList>(`/clubs/${club.id}/members?status=PENDING`),
    serverFetch<MemberList>(`/clubs/${club.id}/members?status=ACTIVE`),
  ]);

  return (
    <StudentShell title="Members">
      <MembersManager
        clubId={club.id}
        initialClub={club}
        initialPending={pending}
        initialActive={active}
      />
    </StudentShell>
  );
}

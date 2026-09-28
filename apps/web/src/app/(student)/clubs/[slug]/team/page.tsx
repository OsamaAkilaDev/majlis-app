import type { AppointmentList } from '@majlis/contracts';
import type { Metadata } from 'next';
import { TeamManager } from '@/components/club/TeamManager';
import { StudentShell } from '@/components/shell/StudentShell';
import { requireClub } from '@/lib/officer-access';
import { serverFetch } from '@/lib/server-api';

export const metadata: Metadata = { title: 'Team' };

export default async function ClubTeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, club } = await requireClub(slug);
  const team = await serverFetch<AppointmentList>(`/clubs/${club.id}/team`);

  return (
    <StudentShell title="Team">
      <TeamManager
        clubId={club.id}
        viewerUserId={user.id}
        initialClub={club}
        initialTeam={team}
      />
    </StudentShell>
  );
}

import type { ClubDetail, DepartmentList } from '@majlis/contracts';
import type { Metadata } from 'next';
import { ClubProfile } from '@/components/ClubProfile';
import { serverFetch } from '@/lib/server-api';
import { requireUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Overview' };

export default async function OverviewPage({ params }: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await params;
  const [user, club, departments] = await Promise.all([
    requireUser(),
    serverFetch<ClubDetail>(`/clubs/${clubId}`),
    serverFetch<DepartmentList>('/departments'),
  ]);

  return (
    <ClubProfile
      clubId={clubId}
      platformRole={user.platformRole}
      initialClub={club}
      initialDepartments={departments?.items ?? null}
      // Keeps an Admin inside the console shell.
      teamHref={`/manage/${clubId}/team`}
    />
  );
}

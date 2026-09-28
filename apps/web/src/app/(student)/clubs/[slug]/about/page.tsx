import type { ClubDetail } from '@majlis/contracts';
import type { Metadata } from 'next';
import { EmptyState } from '@/components/EmptyState';
import { StudentShell } from '@/components/shell/StudentShell';
import { serverFind } from '@/lib/server-api';
import { ClubAboutSections } from '../ClubAbout';

export const metadata: Metadata = { title: 'About' };

/** The phone's About screen; from lg up the club page's rail carries this. */
export default async function ClubAboutPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const club = await serverFind<ClubDetail>(`/clubs/by-slug/${encodeURIComponent(slug)}`);

  return (
    <StudentShell title="About">
      {club ? (
        <div className="flex flex-col gap-6 lg:max-w-2xl">
          <ClubAboutSections club={club} />
        </div>
      ) : (
        <EmptyState title="No such club" />
      )}
    </StudentShell>
  );
}

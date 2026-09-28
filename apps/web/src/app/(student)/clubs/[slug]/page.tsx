import type { ClubDetail as Club, EventList } from '@majlis/contracts';
import type { Metadata } from 'next';
import { StudentShell } from '@/components/shell/StudentShell';
import { serverFetch } from '@/lib/server-api';
import { ClubDetail } from './ClubDetail';

export const metadata: Metadata = { title: 'Club' };

export default async function ClubDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const club = await serverFetch<Club>(`/clubs/by-slug/${encodeURIComponent(slug)}`);

  // Sequential: the events are filtered by the club id only the call above knows.
  const events = club
    ? await serverFetch<EventList>(`/events?clubId=${club.id}`)
    : null;

  return (
    <StudentShell title={club?.name ?? 'Club'}>
      <ClubDetail slug={slug} initialClub={club} initialEvents={events} now={Date.now()} />
    </StudentShell>
  );
}

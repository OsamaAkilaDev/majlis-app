import type { ClubDetail, EventList } from '@majlis/contracts';
import type { Metadata } from 'next';
import { serverFetch } from '@/lib/server-api';
import { requireUser } from '@/lib/session';
import { EventsManager } from './EventsManager';

export const metadata: Metadata = { title: 'Events' };

export default async function EventsPage({ params }: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await params;
  const [user, club, events] = await Promise.all([
    requireUser(),
    serverFetch<ClubDetail>(`/clubs/${clubId}`),
    serverFetch<EventList>(`/events?clubId=${clubId}`),
  ]);

  return (
    <EventsManager
      clubId={clubId}
      platformRole={user.platformRole}
      initialRoles={club?.viewerClubRoles ?? null}
      initialEvents={events}
    />
  );
}

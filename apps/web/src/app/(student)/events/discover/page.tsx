import type { EventList } from '@majlis/contracts';
import type { Metadata } from 'next';
import { StudentShell } from '@/components/shell/StudentShell';
import { serverFetch } from '@/lib/server-api';
import { EventBrowser } from './EventBrowser';

export const metadata: Metadata = { title: 'Discover events' };

export default async function EventsPage() {
  const events = await serverFetch<EventList>('/events?upcoming=true');

  return (
    <StudentShell title="Discover">
      <EventBrowser initialEvents={events} />
    </StudentShell>
  );
}

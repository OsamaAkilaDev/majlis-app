import type { EventList } from '@majlis/contracts';
import type { Metadata } from 'next';
import { ConsoleShell } from '@/components/shell/ConsoleShell';
import { serverFetch } from '@/lib/server-api';
import { EventsOverview } from './EventsOverview';

export const metadata: Metadata = { title: 'Events' };

export default async function EventsPage() {
  const events = await serverFetch<EventList>('/events');

  return (
    <ConsoleShell title="Events">
      <EventsOverview initialEvents={events} />
    </ConsoleShell>
  );
}

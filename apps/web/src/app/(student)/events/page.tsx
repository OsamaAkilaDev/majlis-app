import type { CertificateList, EventList, MyRegistrationList } from '@majlis/contracts';
import type { Metadata } from 'next';
import { SearchLink } from '@/components/shell/SearchLink';
import { StudentShell } from '@/components/shell/StudentShell';
import { serverFetch } from '@/lib/server-api';
import { EventGroups } from './EventGroups';

export const metadata: Metadata = { title: 'Events' };

export default async function EventsPage() {
  const [registered, fromClubs, past, certificates] = await Promise.all([
    serverFetch<MyRegistrationList>(`/me/registrations?past=false`),
    // `fromMyClubs` does not imply `upcoming`, so both are sent.
    serverFetch<EventList>(`/events?upcoming=true&fromMyClubs=true`),
    serverFetch<MyRegistrationList>(`/me/registrations?past=true`),
    serverFetch<CertificateList>(`/me/certificates`),
  ]);

  return (
    <StudentShell
      title="Events"
      action={<SearchLink href="/events/discover" label="Discover events" />}
    >
      <EventGroups
        registered={registered}
        fromClubs={fromClubs}
        past={past}
        certifiedEventIds={(certificates?.items ?? []).map((c) => c.eventId)}
      />
    </StudentShell>
  );
}

import type { AttendanceList, RegistrationList } from '@majlis/contracts';
import type { Metadata } from 'next';
import { EventAttendees } from '@/components/event/EventAttendees';
import { StudentShell } from '@/components/shell/StudentShell';
import { requireEventAction } from '@/lib/officer-access';
import { serverFetch } from '@/lib/server-api';

export const metadata: Metadata = { title: 'Attendees' };

export default async function EventAttendeesPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const { user, event } = await requireEventAction(eventId, 'attendees');

  const [roster, attendance] = await Promise.all([
    serverFetch<RegistrationList>(`/events/${eventId}/registrations`),
    serverFetch<AttendanceList>(`/events/${eventId}/attendance`),
  ]);

  return (
    <StudentShell title="Attendees">
      <EventAttendees
        eventId={eventId}
        platformRole={user.platformRole}
        initialEvent={event}
        initialRoster={roster}
        initialAttendance={attendance}
      />
    </StudentShell>
  );
}

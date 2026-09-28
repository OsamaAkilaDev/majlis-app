import type {
  AssignmentList,
  AttendanceList,
  EventDetail,
  RegistrationList,
} from '@majlis/contracts';
import type { Metadata } from 'next';
import { EventAttendees } from '@/components/event/EventAttendees';
import { EventCertificates } from '@/components/event/EventCertificates';
import { EventForm } from '@/components/event/EventForm';
import { serverFetch } from '@/lib/server-api';
import { requireUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Event' };

export default async function EventEditorPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  // A section behind a permission the viewer lacks comes back null on 403 and is simply absent.
  const [user, event, assignments, roster, attendance] = await Promise.all([
    requireUser(),
    serverFetch<EventDetail>(`/events/${eventId}`),
    serverFetch<AssignmentList>(`/events/${eventId}/assignments`),
    serverFetch<RegistrationList>(`/events/${eventId}/registrations`),
    serverFetch<AttendanceList>(`/events/${eventId}/attendance`),
  ]);

  return (
    <div className="flex flex-col gap-10">
      <EventForm
        eventId={eventId}
        platformRole={user.platformRole}
        initialEvent={event}
        initialAssignments={assignments}
      />
      <EventAttendees
        eventId={eventId}
        platformRole={user.platformRole}
        initialEvent={event}
        initialRoster={roster}
        initialAttendance={attendance}
      />
      {/* Where an Admin arriving from the events overview looks for them. */}
      {event?.certificateEnabled && (event.status === 'COMPLETED' || event.status === 'CERTIFIED') ? (
        <section className="flex flex-col gap-4">
          <h2 className="font-display text-h1 text-ink">Certificates</h2>
          <EventCertificates eventId={eventId} />
        </section>
      ) : null}
    </div>
  );
}

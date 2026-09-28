import type { Metadata } from 'next';
import { CheckInSession } from '@/components/event/CheckInSession';
import { StudentShell } from '@/components/shell/StudentShell';
import { requireEventAction } from '@/lib/officer-access';

export const metadata: Metadata = { title: 'Check in' };

export default async function CheckInPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const { event } = await requireEventAction(eventId, 'checkIn');

  return (
    <StudentShell title="Check in">
      <CheckInSession event={event} />
    </StudentShell>
  );
}

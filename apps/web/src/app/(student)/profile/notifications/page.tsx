import type { NotificationList } from '@majlis/contracts';
import type { Metadata } from 'next';
import { StudentShell } from '@/components/shell/StudentShell';
import { serverFetch } from '@/lib/server-api';
import { Inbox } from './Inbox';

export const metadata: Metadata = { title: 'Inbox' };

export default async function NotificationsPage() {
  const initial = await serverFetch<NotificationList>(`/me/notifications`);

  return (
    <StudentShell title="Inbox">
      <Inbox initial={initial} />
    </StudentShell>
  );
}

import type { NotificationList } from '@majlis/contracts';
import type { ReactNode } from 'react';
import { StudentFrame } from '@/components/shell/StudentFrame';
import { serverFetch } from '@/lib/server-api';
import { requireUser } from '@/lib/session';

export default async function StudentLayout({ children }: { children: ReactNode }) {
  const [user, unread] = await Promise.all([
    requireUser(),
    serverFetch<NotificationList>(`/me/notifications?unread=true`),
  ]);

  return (
    <StudentFrame session={{ user, unread: unread?.items.length ?? 0 }}>{children}</StudentFrame>
  );
}

import type { UserList } from '@majlis/contracts';
import type { Metadata } from 'next';
import { ConsoleShell } from '@/components/shell/ConsoleShell';
import { serverFetch } from '@/lib/server-api';
import { requireUser } from '@/lib/session';
import { UsersManager } from './UsersManager';

export const metadata: Metadata = { title: 'Users' };

export default async function UsersPage() {
  const [user, users] = await Promise.all([
    requireUser(),
    serverFetch<UserList>('/users'),
  ]);

  return (
    <ConsoleShell title="Users">
      <UsersManager viewerId={user.id} initialUsers={users} />
    </ConsoleShell>
  );
}

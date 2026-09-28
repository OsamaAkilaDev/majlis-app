import type { ReactNode } from 'react';
import { ConsoleFrame } from '@/components/shell/ConsoleFrame';
import { requireUser } from '@/lib/session';
import { ADMIN_NAV } from './nav';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  return (
    <ConsoleFrame items={ADMIN_NAV} session={{ user }}>
      {children}
    </ConsoleFrame>
  );
}

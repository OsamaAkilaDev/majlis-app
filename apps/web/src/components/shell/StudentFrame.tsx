'use client';

import type { ReactNode } from 'react';
import { ShellSessionProvider, type ShellSession } from './shell-session';
import { ShellBrand } from './ShellBrand';
import { StudentSideNav, TabBar } from './TabBar';

/** Mounted by `(student)/layout.tsx` so it survives page changes and the dock's pill can travel. */
export function StudentFrame({
  session,
  children,
}: {
  session: ShellSession;
  children: ReactNode;
}) {
  return (
    <ShellSessionProvider value={session}>
      <div className="flex h-dvh overflow-hidden bg-bg">

        <aside className="hidden w-56 shrink-0 flex-col gap-3 border-r border-border bg-surface-2 p-3 pt-[calc(0.75rem+var(--safe-t))] lg:flex">
          <ShellBrand />
          <StudentSideNav />
        </aside>

        {/* relative: the dock floats over the scroll area. grid-cols-1 is load-bearing: an implicit
            auto column sizes to max-content and clips every page on a narrow screen. */}
        <div className="relative grid min-w-0 flex-1 grid-cols-1 grid-rows-[auto_1fr] overflow-hidden">
          {children}
          <TabBar />
        </div>
      </div>
    </ShellSessionProvider>
  );
}

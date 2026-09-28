'use client';

import type { ReactNode } from 'react';
import { BackButton } from './BackButton';
import { NotificationBell } from './NotificationBell';
import { ProfileButton } from './ProfileButton';
import { useShellSession } from './shell-session';

/** Not async: reads the viewer from context, or `loading.tsx` would suspend.
 *  Returns the two rows of `StudentFrame`'s grid. */
export function StudentShell({
  title,
  action,
  children,
}: {
  title: string;
  /** Rendered between the title and the bell. One control, not a toolbar. */
  action?: ReactNode;
  children: ReactNode;
}) {
  const { user, unread } = useShellSession();

  return (
    <>
      <header className="flex items-center gap-1 border-b border-border px-4 pb-3 pt-[calc(0.75rem+var(--safe-t))] lg:px-8">
        <BackButton />
        {/* Smaller below sm, or a club's name and two 44px controls do not fit 320px. */}
        <h1 className="min-w-0 flex-1 truncate pr-2 font-display text-h1 text-ink sm:text-title">
          {title}
        </h1>
        {action}
        <NotificationBell unread={unread} />
        <ProfileButton user={user} />
      </header>

      {/* Load-bearing: clearance for the floating dock (68px + 16px inset + 16px), plus the device inset. */}
      <main
        id="main"
        className="overflow-y-auto overscroll-contain px-4 pt-4 pb-[calc(7rem+var(--safe-b))] lg:px-8 lg:py-6 lg:pb-6"
      >
        {/* min-h-full, never h-full: a fixed height stops main scrolling while content spills under the dock. */}
        <div className="mx-auto min-h-full w-full max-w-5xl">{children}</div>
      </main>
    </>
  );
}

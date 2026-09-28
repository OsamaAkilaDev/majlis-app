'use client';

import type { ReactNode } from 'react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { BackButton } from './BackButton';
import { ProfileButton } from './ProfileButton';
import { useShellSession } from './shell-session';

/** Not async: `loading.tsx` renders this header, and awaiting the session would suspend the fallback. */
export function ConsoleShell({ title, children }: { title: string; children: ReactNode }) {
  const { user } = useShellSession();

  return (
    <>
      {/* pl-16 clears the hamburger, whose box ends at 60px; pl-14 overlapped it. */}
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-bg py-3 pl-16 pr-4 lg:px-8">
        <BackButton />
        <h1 className="min-w-0 flex-1 truncate font-display text-title text-ink">{title}</h1>

        <ThemeToggle />
        <ProfileButton user={user} />
      </header>

      <main id="main" className="mx-auto w-full min-w-0 max-w-7xl flex-1 px-4 py-5 lg:px-8 lg:py-6">
        {children}
      </main>
    </>
  );
}

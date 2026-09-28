'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { SessionUser } from '@majlis/contracts';

/** `unread` is student-only; consoles have no bell. */
export type ShellSession = { user: SessionUser; unread?: number };

const Ctx = createContext<ShellSession | null>(null);

/** Lets the header render without awaiting, so it never suspends inside `loading.tsx`. */
export function ShellSessionProvider({
  value,
  children,
}: {
  value: ShellSession;
  children: ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useShellSession(): ShellSession {
  const value = useContext(Ctx);
  if (!value) {
    throw new Error('useShellSession must be rendered inside the shell layout.');
  }
  return value;
}

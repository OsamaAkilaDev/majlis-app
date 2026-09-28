'use client';

import { List } from '@phosphor-icons/react/ssr';
import type { ReactNode } from 'react';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ICON_WEIGHT } from '@/lib/icons';
import { ShellSessionProvider, type ShellSession } from './shell-session';
import { ShellBrand } from './ShellBrand';
import { SideNav, type NavItem } from './SideNav';

/** Lives in the layout so navigation does not rebuild the nav or refetch the viewer. */
export function ConsoleFrame({
  items,
  session,
  children,
}: {
  items: readonly NavItem[];
  session: ShellSession;
  children: ReactNode;
}) {
  const nav = (
    <div className="flex flex-col gap-3">
      <ShellBrand />
      <SideNav items={items} />
    </div>
  );

  return (
    <ShellSessionProvider value={session}>
      <div className="min-h-dvh bg-bg lg:grid lg:grid-cols-[14rem_1fr]">
        <aside className="hidden border-r border-border bg-surface-2 p-3 lg:block lg:sticky lg:top-0 lg:h-dvh lg:overflow-y-auto">
          {nav}
        </aside>

        <div className="flex min-w-0 flex-col">

          <Sheet>
            <SheetTrigger
              aria-label="Open navigation"
              className="absolute left-4 top-3 z-30 grid size-11 place-items-center rounded-control text-ink-2 hover:bg-surface-2 lg:hidden"
            >
              <List size={20} weight={ICON_WEIGHT} aria-hidden />
            </SheetTrigger>
            <SheetContent side="left" className="w-64 bg-surface-2 p-3">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              {nav}
            </SheetContent>
          </Sheet>

          {children}
        </div>
      </div>
    </ShellSessionProvider>
  );
}

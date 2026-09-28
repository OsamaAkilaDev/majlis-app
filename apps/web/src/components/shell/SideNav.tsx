'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { activeNavHref } from '@/lib/routing';

// A rendered element, not a component: a component type cannot cross the RSC boundary as a prop.
export type NavItem = { href: string; label: string; icon: ReactNode };

export function SideNav({ items }: { items: readonly NavItem[] }) {
  const pathname = usePathname();
  const current = activeNavHref(pathname, items.map((i) => i.href));

  // Full `prefetch`: the default for a dynamic route fetches only loading.tsx.

  return (
    <nav aria-label="Sections" className="flex flex-col gap-0.5">
      {items.map(({ href, label, icon }) => {
        const active = href === current;
        return (
          <Link
            key={href}
            href={href}
            prefetch
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-9 items-center gap-2.5 rounded-control px-2.5 py-2 text-sm transition-colors duration-(--dur-fast) ease-(--ease-out)',
              active ? 'bg-primary-soft font-semibold text-primary-soft-fg' : 'text-ink-2 hover:bg-surface hover:text-ink',
            )}
          >
            {icon}
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

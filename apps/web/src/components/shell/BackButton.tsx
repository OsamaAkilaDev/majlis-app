'use client';

import { CaretLeft } from '@phosphor-icons/react/ssr';
import { usePathname, useRouter } from 'next/navigation';
import { ICON_WEIGHT } from '@/lib/icons';
import { backFallback, isTabRoot } from '@/lib/back';
import { useShellSession } from './shell-session';

/**
 * `router.back()`, not a parent href: back means the viewer's own history.
 * `history.length <= 1` is a heuristic for a cold deep link; the count covers the whole browser tab.
 */
export function BackButton() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useShellSession();

  if (isTabRoot(pathname)) return null;

  function back() {
    if (window.history.length <= 1) {
      router.push(backFallback(pathname, user));
      return;
    }
    router.back();
  }

  return (
    <button
      type="button"
      onClick={back}
      aria-label="Back"
      className="grid size-11 shrink-0 place-items-center rounded-control text-ink-2 hover:bg-surface-2 hover:text-ink"
    >
      <CaretLeft size={20} weight={ICON_WEIGHT} aria-hidden />
    </button>
  );
}

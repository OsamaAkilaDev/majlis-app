'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

/** Sticky, not fixed, so it never covers the last row of a short screen. */
export function SaveBar({
  count,
  busy,
  onDiscard,
  onSave,
  blocked,
  children,
}: {
  count: number;
  busy?: boolean;
  onDiscard: () => void;
  onSave: () => void;
  blocked?: boolean;
  children?: ReactNode;
}) {
  if (count === 0) return null;

  return (
    <div
      role="status"
      className="sticky bottom-0 z-10 -mx-4 mt-6 flex flex-wrap items-center gap-3 border-t border-border bg-surface px-4 py-3 shadow-[0_-8px_24px_-18px_rgba(28,23,19,.5)] lg:-mx-8 lg:px-8"
    >
      <b className="text-sm text-ink">
        {count} {count === 1 ? 'change' : 'changes'}
      </b>
      {children}
      <div className="ml-auto flex gap-2">
        <Button variant="ghost" size="sm" onClick={onDiscard} disabled={busy}>
          Discard
        </Button>
        <Button size="sm" onClick={onSave} disabled={busy || blocked}>
          Save
        </Button>
      </div>
    </div>
  );
}

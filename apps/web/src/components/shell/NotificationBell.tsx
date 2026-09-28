'use client';

import { Bell } from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import { ICON_WEIGHT } from '@/lib/icons';
import { activeNavHref } from '@/lib/routing';

const INBOX = '/profile/notifications';

/** `unread` comes from the server-rendered shell, so the badge is right on first paint. */
export function NotificationBell({ unread = 0 }: { unread?: number }) {
  const pathname = usePathname();
  const current = activeNavHref(pathname, [INBOX]) !== null;
  const badge = unread > 0;
  const count = unread > 9 ? '9+' : String(unread);

  // Lit by glyph colour only: an outline would look like :focus-visible.
  return (
    <Link
      href={INBOX}
      aria-label={badge ? `Notifications, ${count} unread` : 'Notifications'}
      aria-current={current ? 'page' : undefined}
      className={cn(
        'relative grid size-11 place-items-center rounded-full transition-colors duration-(--dur)',
        current ? 'text-primary' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
      )}
    >
      {/* Badge positioned off the icon, not the padded 44px hit area. */}
      <span className="relative">
        <Bell size={20} weight={ICON_WEIGHT} aria-hidden />
        {badge ? (
          <span
            aria-hidden
            className="tabular absolute -right-2.5 -top-1.5 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] font-semibold leading-4 text-primary-fg"
          >
            {count}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

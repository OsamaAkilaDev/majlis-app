'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/cn';
import { initials } from '@/lib/initials';
import { activeNavHref } from '@/lib/routing';
import type { SessionUser } from '@majlis/contracts';

/** Profile screens lit by another control, so the avatar stays unlit on them. */
const CLAIMED_ELSEWHERE = ['/profile/notifications'];

/** The lit state is derived here, not passed in, so no profile screen can forget to declare it. */
export function ProfileButton({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const current =
    activeNavHref(pathname, ['/profile']) !== null &&
    activeNavHref(pathname, CLAIMED_ELSEWHERE) === null;

  return (
    <Link
      href="/profile"
      aria-label="Profile"
      aria-current={current ? 'page' : undefined}
      className={cn(
        'grid size-11 place-items-center rounded-full text-ink-2 transition-colors duration-(--dur)',
        !current && 'hover:bg-surface-2',
      )}
    >
      {/* The halo sits on its own element so it hugs the avatar, not the 44px touch target. */}
      <span
        className={cn(
          'grid place-items-center rounded-full transition-colors duration-(--dur)',
          current && 'bg-primary-soft p-0.5',
        )}
      >
        <Avatar>
          {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
          <AvatarFallback className={cn(current && 'bg-primary text-primary-fg')}>
            {initials(user.fullName)}
          </AvatarFallback>
        </Avatar>
      </span>
    </Link>
  );
}

import { CalendarDots, Users } from '@phosphor-icons/react/ssr';
import type { Icon } from '@phosphor-icons/react';
import { ICON_WEIGHT } from '@/lib/icons';
import type { NavItem } from './SideNav';
import { STUDENT_TAB_ROUTES } from './student-tab-routes';

/** The one list behind every student navigation. No 'use client', so a Server Component can
 *  render the icons. Inbox and profile are absent: both live in the header. */
const TAB_ICONS: Record<(typeof STUDENT_TAB_ROUTES)[number]['href'], Icon> = {
  '/events': CalendarDots,
  '/clubs': Users,
};

export const STUDENT_TABS = STUDENT_TAB_ROUTES.map(({ href, label }) => ({
  href,
  label,
  icon: TAB_ICONS[href],
}));

export const STUDENT_NAV: NavItem[] = STUDENT_TABS.map(({ href, label, icon: Icon }) => ({
  href,
  label,
  icon: <Icon size={16} weight={ICON_WEIGHT} className="shrink-0" aria-hidden />,
}));

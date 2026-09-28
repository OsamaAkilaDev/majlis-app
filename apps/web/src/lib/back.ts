import type { SessionUser } from '@majlis/contracts';
import { STUDENT_TAB_ROUTES } from '@/components/shell/student-tab-routes';
import { ADMIN_NAV_ROUTES } from '@/app/(admin)/admin/nav-routes';
import { activeNavHref, landingFor } from '@/lib/routing';

/** Route lists, not STUDENT_TABS/ADMIN_NAV, so the icon components stay out of the node test environment. */
const ROOT_HREFS: string[] = [...STUDENT_TAB_ROUTES, ...ADMIN_NAV_ROUTES].map((r) => r.href);

/** `/admin/users` must count as a root: `/admin` redirects to it, so its back would go nowhere. */
export function isTabRoot(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
  return ROOT_HREFS.includes(path);
}

/** Back target for a viewer with no in-app history: the section the screen lives under. */
export function backFallback(pathname: string, user: SessionUser): string {
  const tabHref = activeNavHref(pathname, ROOT_HREFS);
  return tabHref ?? landingFor(user);
}

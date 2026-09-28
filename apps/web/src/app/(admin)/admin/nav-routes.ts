/** Sidebar routes without icons, so `back.ts` and its test do not pull in `@phosphor-icons/react/ssr`. */
export const ADMIN_NAV_ROUTES = [
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/departments', label: 'Departments' },
  { href: '/admin/clubs', label: 'Clubs' },
  { href: '/admin/events', label: 'Events' },
  { href: '/admin/audit', label: 'Audit' },
] as const;

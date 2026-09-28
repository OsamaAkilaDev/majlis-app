/** Split from student-nav.tsx so route-only callers do not import the icon library. */
export const STUDENT_TAB_ROUTES = [
  { href: '/events', label: 'Events' },
  { href: '/clubs', label: 'Clubs' },
] as const;

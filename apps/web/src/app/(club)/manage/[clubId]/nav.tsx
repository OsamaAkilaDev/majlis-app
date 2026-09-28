import type { ClubSection } from '@/components/shell/ClubWorkspace';

export function clubSections(clubId: string): ClubSection[] {
  const base = `/manage/${clubId}`;
  return [
    { href: `${base}/overview`, label: 'Overview' },
    { href: `${base}/members`, label: 'Members' },
    { href: `${base}/team`, label: 'Team' },
    { href: `${base}/events`, label: 'Events' },
    { href: `${base}/certificates`, label: 'Certificates' },
    { href: `${base}/reports`, label: 'Reports' },
  ];
}

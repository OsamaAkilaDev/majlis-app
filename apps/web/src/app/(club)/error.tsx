'use client';

import { ErrorPanel } from '@/components/ErrorPanel';

export default function ClubError(props: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  // (club) is Admin-only, so the way out is the admin shell.
  return <ErrorPanel {...props} home={{ href: '/admin', label: 'Admin' }} />;
}

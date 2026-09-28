'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { onMutation } from '@/lib/api';

/** Hands lib/api.ts a router.refresh(), so a write re-renders the page it happened on. */
export function RefreshOnWrite() {
  const router = useRouter();
  useEffect(() => onMutation(() => router.refresh()), [router]);
  return null;
}

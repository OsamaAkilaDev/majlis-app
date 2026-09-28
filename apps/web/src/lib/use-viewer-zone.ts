'use client';

import { useEffect, useState } from 'react';
import { viewerTimeZone } from '@/lib/event-time';

/** Undefined until mounted, so the server's zone never causes a hydration mismatch. */
export function useViewerZone(): string | undefined {
  const [zone, setZone] = useState<string>();
  useEffect(() => setZone(viewerTimeZone()), []);
  return zone;
}

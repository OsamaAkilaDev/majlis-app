'use client';

import { useCallback, useState } from 'react';

/** Rethrows during render: a rejection inside an effect never reaches `error.tsx`. */
export function useAsyncError(): (error: unknown) => void {
  const [, raise] = useState<unknown>();
  return useCallback((error: unknown) => {
    raise(() => {
      throw error;
    });
  }, []);
}

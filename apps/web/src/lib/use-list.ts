'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAsyncError } from '@/lib/use-async-error';

export interface List<T> {
  items: T[];
}

/** `items` is null until the first list lands. With `deps`, refetches when they change. */
export function useList<T>(
  initial?: List<T> | null,
  fetchList?: () => Promise<List<T>>,
  opts: { deps?: readonly unknown[] } = {},
) {
  const [items, setItems] = useState<T[] | null>(initial?.items ?? null);
  const fail = useAsyncError();

  const fetchRef = useRef(fetchList);
  useEffect(() => {
    fetchRef.current = fetchList;
  });

  const show = useCallback((list: List<T> | null) => setItems(list?.items ?? null), []);

  const reload = useCallback(() => {
    fetchRef.current?.().then(show, fail);
  }, [show, fail]);

  // Compared by value, so Strict Mode's second effect run does not refetch.
  const key = opts.deps ? JSON.stringify(opts.deps) : null;
  const loaded = useRef<string | null>(initial ? key : null);

  useEffect(() => {
    if (key === null || loaded.current === key) return;
    const first = loaded.current === null;
    loaded.current = key;
    if (!first) show(null);
    reload();
  }, [key, reload, show]);

  return { items, setItems, show, reload };
}

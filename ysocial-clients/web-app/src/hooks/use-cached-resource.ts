import { useEffect, useState } from "react";

// Session cache shared by every mount: remounted widgets (each page renders its own MainLayout)
// show the last value at once instead of a skeleton, then refresh in the background.
const cache = new Map<string, unknown>();

/** Test-only: forget every cached value. */
export function __clearResourceCache(): void {
  cache.clear();
}

interface CachedResource<T> {
  data: T | null;
  /** True when loading failed and nothing is cached. */
  failed: boolean;
}

/** Stale-while-revalidate loader keyed by `key`. `load` runs once per mount; its identity is ignored. */
export function useCachedResource<T>(key: string, load: () => Promise<T>): CachedResource<T> {
  const [data, setData] = useState<T | null>(() => (cache.has(key) ? (cache.get(key) as T) : null));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    load()
      .then((value) => {
        cache.set(key, value);
        if (active) setData(value);
      })
      .catch(() => {
        if (active && !cache.has(key)) setFailed(true);
      });
    return () => {
      active = false;
    };
    // `load` is usually an inline closure; refetching on its identity would loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { data, failed };
}

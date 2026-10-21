import { useEffect, useState } from "react";
import { useViewerId } from "@/features/auth";

export type ResourceState<T> = { status: "loading" } | { status: "error" } | { status: "ready"; data: T };

const LOADING: ResourceState<never> = { status: "loading" };

/**
 * Loads a viewer-scoped resource: again when the viewer changes (profile switch) & on `retry`; an answer that arrives
 * for an older key is dropped. `load` runs once per key, its identity is ignored. `key` identifies the current load
 * (use it as a React `key` to reset local state derived from the data).
 */
export function useViewerResource<T>(load: () => Promise<T>): { state: ResourceState<T>; key: string; retry: () => void } {
  const viewerId = useViewerId();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; state: ResourceState<T> } | null>(null);
  const key = `${viewerId}:${attempt}`;

  useEffect(() => {
    let cancelled = false;
    load().then(
      (data) => {
        if (!cancelled) setResult({ key, state: { status: "ready", data } });
      },
      () => {
        if (!cancelled) setResult({ key, state: { status: "error" } });
      },
    );
    return () => {
      cancelled = true;
    };
    // `load` is usually an inline closure; refetching on its identity would loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { state: result?.key === key ? result.state : LOADING, key, retry: () => setAttempt((value) => value + 1) };
}

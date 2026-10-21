"use client";

import { useMemo, useRef } from "react";

/** Ignores re-submits while a request is pending, so submit buttons can stay enabled. */
export function useSubmitGuard() {
  const pending = useRef(false);
  return useMemo(
    () => ({
      /** Returns false when a submit is already in flight. */
      enter: () => {
        if (pending.current) return false;
        pending.current = true;
        return true;
      },
      leave: () => {
        pending.current = false;
      },
    }),
    [],
  );
}

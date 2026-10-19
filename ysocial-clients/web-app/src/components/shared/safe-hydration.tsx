"use client";

import React, { useSyncExternalStore } from "react";

interface SafeHydrationProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

const noopSubscribe = () => () => {};

/** Renders `fallback` on the server & first client render, `children` after hydration (no setState-in-effect). */
export function SafeHydration({ children, fallback = null }: SafeHydrationProps) {
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);

  return <>{mounted ? children : fallback}</>;
}
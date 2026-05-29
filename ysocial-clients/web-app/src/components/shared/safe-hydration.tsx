"use client";

import React, { useState, useEffect } from "react";

interface SafeHydrationProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function SafeHydration({ children, fallback = null }: SafeHydrationProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

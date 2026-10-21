"use client";

import { registerAuthStorageSync, useAuthStore } from "@/features/auth";
import { NotificationLiveSync } from "@/features/notifications";
import { ViewerSync } from "@/features/profile";
import { useSearchStore } from "@/features/search";
import { SettingsEffects, useSettingsStore } from "@/features/settings";
import { useUIStore } from "@/lib/store/ui-store";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import React, { useLayoutEffect, useState } from "react";
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  // Instantiates the TanStack query client once per session on the client side
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 5, // 5 minutes cache boundary (crucial for scroll-restoration back triggers)
            refetchOnWindowFocus: false, // Disable aggressive window refetching
            retry: 1, // Restrict retries to 1 for high performance
          },
        },
      })
  );

  // Apply persisted client state right after hydration; layout effect re-renders before the next paint
  useLayoutEffect(() => {
    useAuthStore.getState().actions.hydrate();
    useUIStore.getState().actions.hydrateLocale();
    void useSearchStore.persist.rehydrate();
    void useSettingsStore.persist.rehydrate();
    return registerAuthStorageSync();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <ViewerSync />
        <NotificationLiveSync />
        <SettingsEffects />
        {children}
        <Toaster position="top-center" richColors />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
export default Providers;

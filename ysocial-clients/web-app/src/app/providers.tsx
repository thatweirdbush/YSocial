"use client";

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

  // Apply persisted/browser locale right after hydration; layout effect re-renders before the next paint
  useLayoutEffect(() => {
    useUIStore.getState().actions.hydrateLocale();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        {children}
        <Toaster position="top-center" richColors />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
export default Providers;

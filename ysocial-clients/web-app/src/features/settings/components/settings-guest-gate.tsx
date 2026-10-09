"use client";

import { Lock } from "lucide-react";
import Link from "next/link";
import { MainLayout } from "@/components/layout/main-layout";
import { EmptyState } from "@/components/shared/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { useAuthHydrated, useAuthUser } from "@/features/auth";
import { useTranslation } from "@/hooks/use-translation";
import { cn } from "@/lib/utils";

/**
 * Settings are for signed-in users: a guest gets a login call to action inside the app shell. Waits for auth
 * hydration so a signed-in user never sees the gate flash.
 */
export function SettingsGuestGate({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const hydrated = useAuthHydrated();
  const user = useAuthUser();

  if (!hydrated) return null;
  if (user) return <>{children}</>;

  return (
    <MainLayout>
      <EmptyState
        icon={Lock}
        title={t("settings.guestTitle")}
        action={
          <Link href="/login" className={cn(buttonVariants(), "min-h-11 rounded-full px-5")}>
            {t("settings.guestCta")}
          </Link>
        }
      />
    </MainLayout>
  );
}

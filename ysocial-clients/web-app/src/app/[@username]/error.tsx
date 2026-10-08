"use client";

import { AlertCircle } from "lucide-react";
import { MainLayout } from "@/components/layout/main-layout";
import { EmptyState } from "@/components/shared/empty-state";
import { useTranslation } from "@/hooks/use-translation";

interface ProfileErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ProfileError({ reset }: ProfileErrorProps) {
  const { t } = useTranslation();

  return (
    <MainLayout>
      <EmptyState
        icon={AlertCircle}
        title={t("profile.loadError")}
        action={
          <button
            type="button"
            onClick={reset}
            className="min-h-11 rounded-full border border-zinc-200 px-5 text-sm font-semibold transition-colors hover:bg-zinc-100 motion-reduce:transition-none dark:border-zinc-800 dark:hover:bg-zinc-900"
          >
            {t("profile.retry")}
          </button>
        }
      />
    </MainLayout>
  );
}

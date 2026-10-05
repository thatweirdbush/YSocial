"use client";

import { AlertCircle } from "lucide-react";
import { MainLayout } from "@/components/layout/main-layout";
import { EmptyState } from "@/components/shared/empty-state";
import { useTranslation } from "@/hooks/use-translation";

interface SearchErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function SearchError({ reset }: SearchErrorProps) {
  const { t } = useTranslation();

  return (
    <MainLayout>
      <EmptyState
        icon={AlertCircle}
        title={t("search.error")}
        action={
          <button
            type="button"
            onClick={reset}
            className="min-h-11 px-5 rounded-full border border-zinc-200 dark:border-zinc-800 text-sm font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
          >
            {t("search.retry")}
          </button>
        }
      />
    </MainLayout>
  );
}

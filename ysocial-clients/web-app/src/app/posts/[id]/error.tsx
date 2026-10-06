"use client";

import { AlertCircle } from "lucide-react";
import { MainLayout } from "@/components/layout/main-layout";
import { EmptyState } from "@/components/shared/empty-state";
import { useTranslation } from "@/hooks/use-translation";

interface PostErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function PostError({ reset }: PostErrorProps) {
  const { t } = useTranslation();

  return (
    <MainLayout>
      <EmptyState
        icon={AlertCircle}
        title={t("postDetail.errorTitle")}
        action={
          <button
            type="button"
            onClick={reset}
            className="min-h-11 px-5 rounded-full border border-zinc-200 dark:border-zinc-800 text-sm font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
          >
            {t("postDetail.retry")}
          </button>
        }
      />
    </MainLayout>
  );
}

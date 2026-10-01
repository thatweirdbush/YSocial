"use client";

import { FileQuestion } from "lucide-react";
import Link from "next/link";
import { MainLayout } from "@/components/layout/main-layout";
import { EmptyState } from "@/components/shared/empty-state";
import { useTranslation } from "@/hooks/use-translation";

export default function PostNotFound() {
  const { t } = useTranslation();

  return (
    <MainLayout>
      <EmptyState
        icon={FileQuestion}
        title={t("postDetail.notFoundTitle")}
        action={
          <Link
            href="/"
            className="min-h-11 px-5 flex items-center rounded-full bg-black text-white dark:bg-white dark:text-black text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            {t("postDetail.backHome")}
          </Link>
        }
      />
    </MainLayout>
  );
}

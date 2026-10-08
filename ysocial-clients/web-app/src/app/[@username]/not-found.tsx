"use client";

import { UserX } from "lucide-react";
import Link from "next/link";
import { MainLayout } from "@/components/layout/main-layout";
import { EmptyState } from "@/components/shared/empty-state";
import { useTranslation } from "@/hooks/use-translation";

export default function ProfileNotFound() {
  const { t } = useTranslation();

  return (
    <MainLayout>
      <EmptyState
        icon={UserX}
        title={t("profile.notFoundTitle")}
        description={t("profile.notFoundDescription")}
        action={
          <Link
            href="/"
            className="flex min-h-11 items-center rounded-full bg-black px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90 motion-reduce:transition-none dark:bg-white dark:text-black"
          >
            {t("profile.backHome")}
          </Link>
        }
      />
    </MainLayout>
  );
}

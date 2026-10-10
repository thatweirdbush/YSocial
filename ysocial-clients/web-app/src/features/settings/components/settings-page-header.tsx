"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useTranslation, type TranslationKey } from "@/hooks/use-translation";

/** Section page heading; below `lg` (where the section nav is hidden) it carries a Back link to the index. */
export function SettingsPageHeader({ title }: { title: TranslationKey }) {
  const { t } = useTranslation();

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-zinc-200/60 bg-white/70 px-2 backdrop-blur-md dark:border-zinc-900/60 dark:bg-black/70">
      <Link
        href="/settings"
        aria-label={t("settings.back")}
        className="flex size-11 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-black motion-reduce:transition-none lg:hidden dark:hover:bg-zinc-900 dark:hover:text-white"
      >
        <ArrowLeft className="size-5" aria-hidden="true" />
      </Link>
      <h1 className="px-2 text-lg font-bold tracking-tight text-zinc-900 lg:px-4 dark:text-zinc-50">{t(title)}</h1>
    </header>
  );
}

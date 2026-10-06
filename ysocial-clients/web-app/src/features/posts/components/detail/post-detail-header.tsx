"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/hooks/use-translation";

export function PostDetailHeader() {
  const { t } = useTranslation();
  const router = useRouter();

  // Deep links have no in-app history to return to, so fall back to the feed.
  const handleBack = () => {
    if (window.history.length > 1) router.back();
    else router.push("/");
  };

  return (
    <header className="sticky top-0 z-20 h-14 shrink-0 flex items-center gap-4 px-2 bg-white/70 dark:bg-black/70 backdrop-blur-md border-b border-zinc-200/60 dark:border-zinc-900/60">
      <button
        type="button"
        onClick={handleBack}
        aria-label={t("postDetail.back")}
        className="size-11 flex items-center justify-center rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
      >
        <ArrowLeft className="size-5" aria-hidden="true" />
      </button>
      <h1 className="font-bold text-base">{t("postDetail.title")}</h1>
    </header>
  );
}

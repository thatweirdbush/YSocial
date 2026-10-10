"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/hooks/use-translation";
import { cn } from "@/lib/utils";
import { SETTINGS_SECTIONS } from "../constants";

/** Section menu shown as the aside of every settings section page (lg and up). */
export function SettingsNav() {
  const { t } = useTranslation();
  const pathname = usePathname();

  return (
    <nav aria-label={t("settings.title")} className="flex flex-col gap-1 px-3">
      <h2 className="px-3 pb-2 text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-50">{t("settings.title")}</h2>
      {SETTINGS_SECTIONS.map(({ href, titleKey, icon: Icon }) => {
        const isActive = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm transition-colors motion-reduce:transition-none",
              isActive
                ? "bg-zinc-100 font-semibold text-black dark:bg-zinc-900 dark:text-white"
                : "text-zinc-600 hover:bg-zinc-100/60 hover:text-black dark:text-zinc-400 dark:hover:bg-zinc-900/40 dark:hover:text-zinc-100",
            )}
          >
            <Icon className="size-4.5 shrink-0" aria-hidden="true" />
            {t(titleKey)}
          </Link>
        );
      })}
    </nav>
  );
}

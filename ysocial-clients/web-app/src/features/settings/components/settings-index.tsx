"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "@/hooks/use-translation";
import { SETTINGS_SECTIONS } from "../constants";

/** `/settings` body: the section list in the center column (the right sidebar stays the default one). */
export function SettingsIndex() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col">
      <h1 className="p-4 text-xl font-bold text-zinc-900 dark:text-zinc-50">{t("settings.title")}</h1>
      <ul className="flex flex-col">
        {SETTINGS_SECTIONS.map(({ href, titleKey, icon: Icon }) => (
          <li key={href} className="border-b border-zinc-200/50 last:border-0 dark:border-zinc-900/50">
            <Link
              href={href}
              className="flex min-h-14 items-center gap-3 px-4 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50 motion-reduce:transition-none dark:text-zinc-50 dark:hover:bg-zinc-900/40"
            >
              <Icon className="size-4.5 shrink-0 text-zinc-400" aria-hidden="true" />
              <span className="flex-1">{t(titleKey)}</span>
              <ChevronRight className="size-4 text-zinc-400" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

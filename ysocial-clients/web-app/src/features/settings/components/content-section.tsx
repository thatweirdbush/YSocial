"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Switch } from "@/components/ui/switch";
import { type TranslationKey, useTranslation } from "@/hooks/use-translation";
import { hasCapability } from "@/lib/capabilities";
import { useDisplayPrefs, useSettingsActions } from "../store/settings-store";
import { SettingsPageHeader } from "./settings-page-header";

const SWITCHES = [
  { id: "hide-like-counts", pref: "hideLikeCounts", label: "settings.hideLikeCounts" },
  { id: "hide-share-counts", pref: "hideShareCounts", label: "settings.hideShareCounts" },
] as const satisfies ReadonlyArray<{ id: string; pref: "hideLikeCounts" | "hideShareCounts"; label: TranslationKey }>;

/** `/settings/content`: link to the muted accounts & viewer display preferences (per device, not per-post `hideLikeCount`). */
export function ContentSection() {
  const { t } = useTranslation();
  const prefs = useDisplayPrefs();
  const { setHideLikeCounts, setHideShareCounts } = useSettingsActions();
  const setters = { hideLikeCounts: setHideLikeCounts, hideShareCounts: setHideShareCounts };

  return (
    <>
      <SettingsPageHeader title="settings.content" />
      {hasCapability("muteUi") && (
        <Link
          href="/settings/muted"
          className="flex min-h-14 items-center gap-3 border-b border-zinc-200/60 px-4 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50 motion-reduce:transition-none dark:border-zinc-900/60 dark:text-zinc-50 dark:hover:bg-zinc-900/40"
        >
          <span className="flex-1">{t("settings.mutedLink")}</span>
          <ChevronRight className="size-4 text-zinc-400" aria-hidden="true" />
        </Link>
      )}
      <section className="flex flex-col gap-1 p-4">
        <p className="pb-3 text-sm text-zinc-500 dark:text-zinc-400">{t("settings.onThisDevice")}</p>
        {SWITCHES.map(({ id, pref, label }) => (
          <div key={id} className="flex min-h-11 items-center justify-between gap-4 py-2">
            <label htmlFor={id} className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              {t(label)}
            </label>
            <Switch id={id} checked={prefs[pref]} onCheckedChange={setters[pref]} />
          </div>
        ))}
      </section>
    </>
  );
}

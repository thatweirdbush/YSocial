"use client";

import { useMemo, useSyncExternalStore } from "react";
import { useTranslation } from "@/hooks/use-translation";
import { dailyAverage, localDateKey, parseUsage, readUsageRaw, subscribeUsage, usageForLastDays } from "../utils/usage-tracker";
import { SettingsPageHeader } from "./settings-page-header";

const DAYS = 7;
const BAR_WIDTH = 100;

/** `3900` -> `1h 05m`, `857` -> `14m`, under a minute -> `<1m` (unit letters are language neutral). */
const formatDuration = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return "<1m";
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${String(minutes % 60).padStart(2, "0")}m` : `${minutes}m`;
};

/** `/settings/time-management`: today, the last 7 days & the daily average, recorded on THIS device only. */
export function TimeManagementSection() {
  const { t, locale } = useTranslation();
  // Server & first client render see "no data"; the real value arrives right after hydration
  const raw = useSyncExternalStore(subscribeUsage, readUsageRaw, () => null);
  const usage = useMemo(() => parseUsage(raw), [raw]);

  const today = localDateKey(Date.now());
  const days = usageForLastDays(usage, DAYS, today);
  const hasData = days.some(({ seconds }) => seconds > 0);
  const peak = Math.max(...days.map(({ seconds }) => seconds), 1);
  const dayFormat = new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", { weekday: "short", day: "numeric", month: "numeric" });

  return (
    <>
      <SettingsPageHeader title="settings.timeManagement" />
      <section className="flex flex-col gap-6 p-4">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{t("settings.onThisDevice")}</p>
        {!hasData ? (
          <p className="py-8 text-center text-sm font-medium text-zinc-400 dark:text-zinc-500">{t("settings.usageEmpty")}</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-sm text-zinc-500 dark:text-zinc-400">{t("settings.usageToday")}</span>
                <span data-slot="usage-today" className="text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
                  {formatDuration(days[DAYS - 1].seconds)}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-sm text-zinc-500 dark:text-zinc-400">{t("settings.usageAverage")}</span>
                <span data-slot="usage-average" className="text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
                  {formatDuration(dailyAverage(usage, DAYS, today))}
                </span>
              </div>
            </div>
            <ul className="flex flex-col gap-3">
              {days.map(({ date, seconds }) => {
                const [year, month, day] = date.split("-").map(Number);
                return (
                  <li key={date} className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
                    <span className="w-24 shrink-0">{dayFormat.format(new Date(year, month - 1, day))}</span>
                    <svg viewBox={`0 0 ${BAR_WIDTH} 4`} preserveAspectRatio="none" className="h-2 flex-1" aria-hidden="true">
                      <rect width={BAR_WIDTH} height="4" className="fill-zinc-100 dark:fill-zinc-900" />
                      <rect width={(seconds / peak) * BAR_WIDTH} height="4" className="fill-zinc-900 dark:fill-zinc-100" />
                    </svg>
                    <span className="w-16 shrink-0 text-right tabular-nums">{formatDuration(seconds)}</span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
    </>
  );
}

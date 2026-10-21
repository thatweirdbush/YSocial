import type { TranslationKey } from "@/hooks/use-translation";

type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;

/** ISO timestamp -> "5 phút trước" style text; an unparseable value is shown as it is. */
export function formatNotificationTime(value: string, t: Translate): string {
  const created = new Date(value).getTime();
  if (Number.isNaN(created)) return value;
  const minutes = Math.max(1, Math.floor((Date.now() - created) / 60000));
  if (minutes < 60) return t("card.minutesAgo", { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("card.hoursAgo", { n: hours });
  return t("card.daysAgo", { n: Math.floor(hours / 24) });
}

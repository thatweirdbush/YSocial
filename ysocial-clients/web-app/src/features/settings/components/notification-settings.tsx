"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useViewerId } from "@/features/auth";
import {
  loadPreferences,
  setPreference,
  useNotificationPreferencesStore,
  type NotificationPreferences,
} from "@/features/notifications";
import { type TranslationKey, useTranslation } from "@/hooks/use-translation";

const ROWS: ReadonlyArray<{ key: keyof NotificationPreferences; label: TranslationKey; hint: TranslationKey }> = [
  { key: "likes", label: "settings.notifyLikes", hint: "settings.notifyLikesHint" },
  { key: "replies", label: "settings.notifyReplies", hint: "settings.notifyRepliesHint" },
  { key: "follows", label: "settings.notifyFollows", hint: "settings.notifyFollowsHint" },
];

/** Per-kind notification switches. Edits are optimistic & coalesced by the store; nothing is editable before the first load. */
export function NotificationSettings() {
  const { t } = useTranslation();
  const viewerId = useViewerId();
  const status = useNotificationPreferencesStore((state) => state.status);
  const desired = useNotificationPreferencesStore((state) => state.desired);

  // Per profile: reload when the viewer changes (login, account switch)
  useEffect(() => {
    void loadPreferences();
  }, [viewerId]);

  const handleChange = (key: keyof NotificationPreferences, value: boolean) => {
    void setPreference(key, value).then((ok) => {
      if (!ok) toast.error(t("common.error"));
    });
  };

  if (status === "error") {
    return (
      <section className="flex flex-col items-center gap-4 px-4 py-16 text-center">
        <p className="text-sm font-medium text-zinc-400 dark:text-zinc-500">{t("notifications.loadError")}</p>
        <Button type="button" variant="outline" onClick={() => void loadPreferences()} className="min-h-11 rounded-full px-5">
          {t("notifications.retry")}
        </Button>
      </section>
    );
  }

  if (status !== "ready" || !desired) {
    return (
      <section className="flex flex-col gap-6 p-4" role="status" aria-busy="true">
        {ROWS.map(({ key }) => (
          <div key={key} className="flex min-h-11 items-center justify-between gap-4">
            <div className="flex w-full flex-col gap-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-2/3" />
            </div>
            <Skeleton className="h-6 w-11 rounded-full" />
          </div>
        ))}
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-1 p-4">
      <p className="pb-3 text-sm text-zinc-500 dark:text-zinc-400">{t("settings.notificationsDescription")}</p>
      {ROWS.map(({ key, label, hint }) => (
        <div key={key} className="flex min-h-11 items-center justify-between gap-4 py-2">
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor={`notify-${key}`} className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              {t(label)}
            </label>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">{t(hint)}</p>
          </div>
          <Switch id={`notify-${key}`} checked={desired[key]} onCheckedChange={(value) => handleChange(key, value)} />
        </div>
      ))}
    </section>
  );
}

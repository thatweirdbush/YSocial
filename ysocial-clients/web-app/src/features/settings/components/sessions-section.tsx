"use client";

import { Loader2, Monitor, Smartphone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { FeatureUnavailable } from "@/components/shared/feature-unavailable";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSubmitGuard } from "@/features/auth";
import { useTranslation } from "@/hooks/use-translation";
import { ApiError } from "@/lib/api-error";
import { hasCapability } from "@/lib/capabilities";
import { useViewerResource } from "../hooks/use-viewer-resource";
import { fetchSessions, revokeSession } from "../services/account-service";
import type { SessionItem } from "../types";
import { describeUserAgent } from "../utils/describe-user-agent";
import { SettingsPageHeader } from "./settings-page-header";

/** `/settings/sessions`: where the account is signed in, with remote sign-out. Real BE only (no mock adapter). */
export function SessionsSection() {
  if (!hasCapability("accountUi")) return <FeatureUnavailable />;
  return <SessionsLoader />;
}

function SessionsLoader() {
  const { t } = useTranslation();
  const { state, key, retry } = useViewerResource(fetchSessions);

  return (
    <>
      <SettingsPageHeader title="settings.sessions" />
      {state.status === "loading" && (
        <section className="flex flex-col gap-4 p-4" role="status" aria-busy="true">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </section>
      )}
      {state.status === "error" && (
        <section className="flex flex-col items-center gap-4 px-4 py-16 text-center">
          <p className="text-sm font-medium text-zinc-400 dark:text-zinc-500">{t("settings.loadFailed")}</p>
          <Button type="button" variant="outline" onClick={retry} className="min-h-11 rounded-full px-5">
            {t("settings.retry")}
          </Button>
        </section>
      )}
      {state.status === "ready" && <SessionList key={key} initial={state.data} />}
    </>
  );
}

function SessionList({ initial }: { initial: SessionItem[] }) {
  const { t, locale } = useTranslation();
  const guard = useSubmitGuard();
  const [items, setItems] = useState(initial);
  const [target, setTarget] = useState<SessionItem | null>(null);
  const [revoking, setRevoking] = useState(false);
  const format = new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", { dateStyle: "medium", timeStyle: "short" });
  const formatDate = (iso: string) => (iso ? format.format(new Date(iso)) : "-");

  const confirmRevoke = async () => {
    if (!target || !guard.enter()) return;
    const { id } = target;
    setRevoking(true);
    try {
      await revokeSession(id);
      setItems((current) => current.filter((session) => session.id !== id));
    } catch (error) {
      // 404 = already gone (purged family): same end state as a revoke
      if (error instanceof ApiError && error.status === 404) setItems((current) => current.filter((session) => session.id !== id));
      else toast.error(t("common.error"));
    } finally {
      guard.leave();
      setRevoking(false);
      setTarget(null);
    }
  };

  return (
    <>
      <ul className="flex flex-col">
        {items.map((session) => {
          const device = describeUserAgent(session.userAgent);
          const name = device ? `${device.browser} · ${device.os}` : t("settings.sessionUnknownDevice");
          const Icon = device?.os === "Android" || device?.os === "iOS" ? Smartphone : Monitor;
          return (
            <li key={session.id} className="flex items-start gap-3 border-b border-zinc-200/60 px-4 py-4 last:border-0 dark:border-zinc-900/60">
              <Icon className="mt-0.5 size-5 shrink-0 text-zinc-400" aria-hidden="true" />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span id={`session-${session.id}`} className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    {name}
                  </span>
                  {session.isCurrent && (
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                      {t("settings.sessionCurrent")}
                    </span>
                  )}
                </div>
                {session.profileUsername && <span className="text-xs text-zinc-500 dark:text-zinc-400">@{session.profileUsername}</span>}
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {t("settings.sessionSignedIn")}: {formatDate(session.createdAt)}
                </span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {t("settings.sessionTokenIssued")}: {formatDate(session.lastTokenIssuedAt)}
                </span>
              </div>
              {!session.isCurrent && (
                <Button
                  type="button"
                  variant="outline"
                  aria-describedby={`session-${session.id}`}
                  onClick={() => setTarget(session)}
                  className="min-h-11 shrink-0 rounded-full px-4"
                >
                  {t("settings.sessionRevoke")}
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      <AlertDialog open={target !== null} onOpenChange={(open) => !open && !revoking && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.sessionRevokeConfirm")}</AlertDialogTitle>
            <AlertDialogDescription>{t("settings.sessionRevokeNote")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11 rounded-full">{t("card.editCancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                // Stay open while the request runs (spinner); the dialog closes when it settles
                event.preventDefault();
                void confirmRevoke();
              }}
              className="min-h-11 rounded-full"
            >
              {revoking && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
              {t("settings.sessionRevoke")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

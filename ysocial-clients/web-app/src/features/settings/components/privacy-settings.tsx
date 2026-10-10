"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
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
import { Switch } from "@/components/ui/switch";
import { useActorId } from "@/features/auth";
import {
  commitPrivacy,
  ensureRelationSets,
  useFollowRequestCount,
  useIsPrivateAccount,
  useRelationsLoaded,
} from "@/features/profile";
import { useTranslation } from "@/hooks/use-translation";

/** Private account toggle. Going public asks first and says how many pending requests get accepted (spec D15). */
export function PrivacySettings() {
  const { t } = useTranslation();
  const actorId = useActorId();
  const isPrivate = useIsPrivateAccount();
  const loaded = useRelationsLoaded();
  const requestCount = useFollowRequestCount();
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    ensureRelationSets(actorId).catch(() => undefined);
  }, [actorId]);

  const apply = (next: boolean) => {
    void commitPrivacy(actorId, next).then(({ ok }) => {
      if (!ok) toast.error(t("relations.actionError"));
    });
  };

  const handleChange = (next: boolean) => {
    if (next) apply(true);
    else setConfirmOpen(true);
  };

  return (
    <section className="flex flex-col gap-1 px-4 py-4">
      <div className="flex min-h-11 items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="private-account" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {t("settings.privateAccount")}
          </label>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{t("settings.privateAccountDescription")}</p>
        </div>
        <Switch id="private-account" checked={isPrivate} disabled={!loaded} onCheckedChange={handleChange} />
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.goPublicTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.goPublicDescription")}
              {requestCount > 0 && ` ${t("settings.goPublicRequests", { count: requestCount })}`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11 rounded-full">{t("card.editCancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false);
                apply(false);
              }}
              className="min-h-11 rounded-full"
            >
              {t("settings.goPublicConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

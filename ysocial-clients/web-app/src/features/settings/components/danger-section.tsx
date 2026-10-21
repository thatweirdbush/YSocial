"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
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
import { Input } from "@/components/ui/input";
import { useAuthActions, useAuthUser, useSubmitGuard } from "@/features/auth";
import { useTranslation } from "@/hooks/use-translation";
import { hasCapability } from "@/lib/capabilities";
import { deleteAccount } from "../services/account-service";
import { SettingsPageHeader } from "./settings-page-header";

/** `/settings/danger`: delete the account (deactivation is not offered). Real BE only (no mock adapter). */
export function DangerSection() {
  if (!hasCapability("accountUi")) return <FeatureUnavailable />;
  return <DeleteAccount />;
}

function DeleteAccount() {
  const { t } = useTranslation();
  const router = useRouter();
  const user = useAuthUser();
  const { clearAuth } = useAuthActions();
  const guard = useSubmitGuard();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Same fallback the profile link uses for a snapshot without username
  const username = (user?.username ?? user?.email.split("@")[0] ?? "").toLowerCase();

  const handleOpenChange = (next: boolean) => {
    if (deleting) return;
    setOpen(next);
    if (!next) {
      setTyped("");
      setMismatch(false);
    }
  };

  const confirmDelete = async () => {
    if (typed.trim().toLowerCase() !== username || username === "") {
      setMismatch(true);
      return;
    }
    if (!guard.enter()) return;
    setDeleting(true);
    try {
      await deleteAccount();
      clearAuth();
      router.push("/login");
    } catch {
      toast.error(t("common.error"));
    } finally {
      guard.leave();
      setDeleting(false);
    }
  };

  return (
    <>
      <SettingsPageHeader title="settings.danger" />
      <section className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold text-destructive">{t("settings.deleteAccount")}</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{t("settings.deleteAccountWarn")}</p>
        </div>
        <Button type="button" variant="destructive" onClick={() => setOpen(true)} className="min-h-11 self-start rounded-full px-5">
          {t("settings.deleteAccount")}
        </Button>
      </section>

      <AlertDialog open={open} onOpenChange={handleOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.deleteAccount")}</AlertDialogTitle>
            <AlertDialogDescription>{t("settings.deleteAccountWarn")}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2">
            <label htmlFor="delete-account-username" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              {t("settings.deleteAccountType")}
            </label>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              <code className="font-semibold">{username}</code>
            </p>
            <Input
              id="delete-account-username"
              autoComplete="off"
              autoCapitalize="none"
              value={typed}
              aria-invalid={mismatch ? true : undefined}
              onChange={(event) => {
                setTyped(event.target.value);
                setMismatch(false);
              }}
              className="h-11"
            />
            {mismatch && (
              <p role="alert" className="text-sm text-destructive">
                {t("settings.deleteAccountMismatch")}
              </p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11 rounded-full">{t("card.editCancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                // Stay open: a mismatch or a failure keeps the dialog for another try
                event.preventDefault();
                void confirmDelete();
              }}
              className="min-h-11 rounded-full bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
              {t("settings.deleteAccountConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

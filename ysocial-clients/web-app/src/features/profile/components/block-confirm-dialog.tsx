"use client";

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
import { useTranslation } from "@/hooks/use-translation";

interface BlockConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  username: string;
  onConfirm: () => void;
}

/** Block confirmation shared by the post menu & the profile header menu. The caller owns the open state. */
export function BlockConfirmDialog({ open, onOpenChange, username, onConfirm }: BlockConfirmDialogProps) {
  const { t } = useTranslation();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent onClick={(event) => event.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("relations.blockTitle", { username })}</AlertDialogTitle>
          <AlertDialogDescription>{t("relations.blockDescription")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-11 rounded-full">{t("card.editCancel")}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm} className="min-h-11 rounded-full">
            {t("relations.blockConfirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

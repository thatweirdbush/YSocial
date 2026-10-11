"use client";

import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ShieldAlert } from "lucide-react";
import { useTranslation } from "@/hooks/use-translation";

interface DiscardWarningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaveDraft: () => void;
  onDiscard: () => void;
  onKeepEditing: () => void;
}

export function DiscardWarningDialog({
  open,
  onOpenChange,
  onSaveDraft,
  onDiscard,
  onKeepEditing,
}: DiscardWarningDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[320px] rounded-3xl p-6 border-zinc-200/50 dark:border-zinc-900 bg-white dark:bg-zinc-950 shadow-2xl z-50 text-center flex flex-col gap-4 select-none"
      >
        <div className="mx-auto size-12 rounded-full bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center text-zinc-900 dark:text-zinc-50">
          <ShieldAlert className="size-6 text-zinc-950 dark:text-zinc-100" />
        </div>
        <div className="flex flex-col gap-1">
          <DialogTitle className="text-sm font-bold text-zinc-900 dark:text-zinc-50 uppercase tracking-wider">
            {t("creator.unsavedTitle") || "Discard changes?"}
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
            {t("creator.unsavedDesc") || "You have unsaved changes. Do you want to save this post as a draft or discard it?"}
          </DialogDescription>
        </div>
        <div className="flex flex-col gap-1.5 mt-1">
          <button
            type="button"
            onClick={onSaveDraft}
            className="w-full h-9 rounded-xl bg-zinc-950 dark:bg-zinc-50 text-white dark:text-black font-bold text-xs hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all cursor-pointer"
          >
            {t("creator.saveDraft") || "Save Draft"}
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="w-full h-9 rounded-xl border border-zinc-250 dark:border-zinc-800 hover:bg-red-50 dark:hover:bg-red-950/20 text-red-500 font-bold text-xs transition-all cursor-pointer"
          >
            {t("creator.discard") || "Discard"}
          </button>
          <button
            type="button"
            onClick={onKeepEditing}
            className="w-full h-9 rounded-xl text-zinc-500 dark:text-zinc-400 font-bold text-xs hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-all cursor-pointer"
          >
            {t("creator.keepEditing") || "Keep editing"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

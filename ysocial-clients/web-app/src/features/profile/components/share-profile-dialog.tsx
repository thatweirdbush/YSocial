"use client";

import { Check, Download, Link2 } from "lucide-react";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/hooks/use-translation";
import type { UserProfile } from "../types";
import { buildProfileUrl, copyProfileLink } from "../utils/share";

export const QR_SIZE = 220;
export const QR_AVATAR_SIZE = 44;
export const QR_LEVEL = "M";

const COPIED_FEEDBACK_MS = 1500;

interface ShareProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserProfile;
}

export function ShareProfileDialog({ open, onOpenChange, user }: ShareProfileDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-50 w-[95vw] max-w-sm rounded-3xl border-zinc-200/50 bg-white p-6 shadow-2xl dark:border-zinc-900 dark:bg-zinc-950">
        {/* Mounted only while open: the URL needs the browser origin */}
        <ShareProfileBody user={user} />
      </DialogContent>
    </Dialog>
  );
}

const isSecurityError = (error: unknown): boolean => error instanceof DOMException && error.name === "SecurityError";

const nextFrame = (): Promise<void> =>
  new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 16);
  });

function ShareProfileBody({ user }: { user: UserProfile }) {
  const { t } = useTranslation();
  const [url] = useState(() => buildProfileUrl(user.username));
  const [copied, setCopied] = useState(false);
  // The embedded avatar may taint the export canvas; the fallback re-renders without it (spec D15)
  const [withAvatar, setWithAvatar] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  const hasAvatar = Boolean(user.avatarUrl);
  const imageSettings = (crossOrigin?: "anonymous") =>
    hasAvatar && user.avatarUrl
      ? { src: user.avatarUrl, height: QR_AVATAR_SIZE, width: QR_AVATAR_SIZE, excavate: true, ...(crossOrigin ? { crossOrigin } : {}) }
      : undefined;

  const handleCopy = async () => {
    if (await copyProfileLink(user.username)) {
      toast.success(t("share.copied"));
      setCopied(true);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    } else {
      toast.error(t("share.copyFailed"));
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  };

  const exportPng = (): string => {
    const canvas = canvasRef.current;
    if (!canvas) throw new Error("QR canvas is not mounted");
    return canvas.toDataURL("image/png");
  };

  const saveDataUrl = (dataUrl: string) => {
    const anchor = document.createElement("a");
    anchor.href = dataUrl;
    anchor.download = `ysocial-${user.username}-qr.png`;
    anchor.click();
  };

  const handleDownload = async () => {
    try {
      saveDataUrl(exportPng());
      return;
    } catch (error) {
      if (!isSecurityError(error) || !withAvatar || !hasAvatar) {
        toast.error(t("share.downloadFailed"));
        return;
      }
    }
    // Tainted canvas (avatar host without CORS): retry once without the embedded avatar
    setWithAvatar(false);
    await nextFrame();
    try {
      saveDataUrl(exportPng());
    } catch {
      toast.error(t("share.downloadFailed"));
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          {t("share.qrTitle", { username: user.username })}
        </DialogTitle>
        <DialogDescription className="sr-only">{url}</DialogDescription>
      </DialogHeader>

      {/* Always dark-on-white, even in dark mode, so every scanner can read it */}
      <div className="mx-auto rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
        <QRCodeSVG
          value={url}
          size={QR_SIZE}
          level={QR_LEVEL}
          bgColor="#ffffff"
          fgColor="#18181b"
          imageSettings={imageSettings()}
        />
      </div>

      <QRCodeCanvas
        // Keyed by withAvatar: a redraw into the same element keeps a tainted canvas tainted, the retry needs a fresh one
        key={withAvatar ? "qr-avatar" : "qr-plain"}
        ref={canvasRef}
        value={url}
        size={QR_SIZE}
        level={QR_LEVEL}
        bgColor="#ffffff"
        fgColor="#18181b"
        className="hidden"
        imageSettings={withAvatar ? imageSettings("anonymous") : undefined}
      />

      <div className="flex items-center gap-2">
        <Input
          ref={inputRef}
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
          className="min-h-11 rounded-xl border-zinc-200/70 text-xs dark:border-zinc-900 dark:bg-black"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={t("share.copyLink")}
          data-copied={copied}
          onClick={() => void handleCopy()}
          className="size-11 shrink-0 rounded-full"
        >
          {copied ? <Check className="size-4 text-emerald-500" aria-hidden="true" /> : <Link2 className="size-4" aria-hidden="true" />}
        </Button>
      </div>

      <Button
        type="button"
        onClick={() => void handleDownload()}
        className="min-h-11 w-full gap-2 rounded-full bg-black font-semibold text-white hover:bg-zinc-900 dark:bg-white dark:text-black dark:hover:bg-zinc-100"
      >
        <Download className="size-4" aria-hidden="true" />
        {t("share.downloadPng")}
      </Button>
    </>
  );
}

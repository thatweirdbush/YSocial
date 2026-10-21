"use client";

import { Loader2, RotateCcw, X } from "lucide-react";

import { MediaImage } from "@/components/shared/media-image";
import { useTranslation } from "@/hooks/use-translation";
import type { QueueItem } from "@/hooks/use-media-upload-queue";
import { describeMediaProblem } from "@/lib/media/media-messages";

interface MediaQueuePreviewProps {
  items: readonly QueueItem[];
  onRemove: (localId: string) => void;
  onRetry: (localId: string) => void;
}

/** Previews of the files being uploaded (composer): progress label, error with retry, remove. */
export function MediaQueuePreview({ items, onRemove, onRetry }: MediaQueuePreviewProps) {
  const { t } = useTranslation();

  if (items.length === 0) return null;

  return (
    <div className="no-scrollbar flex w-full flex-row gap-2 overflow-x-auto py-2">
      {items.map((item) => {
        const busy = item.status === "compressing" || item.status === "uploading";

        return (
          <div
            key={item.localId}
            className="relative h-44 w-44 shrink-0 overflow-hidden rounded-2xl border border-zinc-150 bg-zinc-100 shadow-sm dark:border-zinc-900 dark:bg-zinc-900"
          >
            {item.kind === "video" ? (
              <video src={item.previewUrl} muted playsInline preload="metadata" className="pointer-events-none size-full object-cover" />
            ) : (
              <MediaImage src={item.previewUrl} alt={item.fileName} fill sizes="176px" className="pointer-events-none object-cover" />
            )}

            {busy && (
              <div role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/45 text-xs font-semibold text-white">
                <Loader2 className="size-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                {item.status === "compressing" ? t("media.optimizing") : t("media.uploading")}
              </div>
            )}

            {item.status === "error" && item.error && (
              <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 p-2 text-center text-xs font-semibold text-white">
                <span className="line-clamp-4">{describeMediaProblem(item.error, t)}</span>
                <button
                  type="button"
                  onClick={() => onRetry(item.localId)}
                  className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 hover:bg-white/25 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
                >
                  <RotateCcw className="size-3" aria-hidden="true" />
                  {t("media.retry")}
                </button>
              </div>
            )}

            <button
              type="button"
              aria-label={t("media.remove")}
              onClick={() => onRemove(item.localId)}
              className="absolute top-2 right-2 flex size-6 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-black/75 text-white transition-all hover:bg-black focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
            >
              <X className="size-3 shrink-0" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

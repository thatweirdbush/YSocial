"use client";

import { Maximize2, Play } from "lucide-react";

import { MediaImage } from "@/components/shared/media-image";
import { VideoPlayer } from "@/components/shared/video-player";
import { useTranslation } from "@/hooks/use-translation";
import { aspectClassOf } from "@/lib/media/aspect";
import { posterOf } from "@/lib/media/media-loader";
import { cn } from "@/lib/utils";

import type { PostMediaItem } from "../types";

interface PostMediaGridProps {
  items: PostMediaItem[];
  onOpen: (index: number) => void;
}

const FRAME = "mt-2 w-full overflow-hidden rounded-2xl border border-zinc-200/50 shadow-sm dark:border-zinc-800/40";
const TILE = "relative block size-full cursor-zoom-in overflow-hidden bg-zinc-150 outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 dark:bg-zinc-900 dark:focus-visible:ring-zinc-100";

const SINGLE_SIZES = "(min-width: 640px) 560px, 100vw";
const TILE_SIZES = "(min-width: 640px) 280px, 50vw";

/** Multi-media grid (Threads/X layouts for 1, 2, 3, 4+ items); no hover scaling, so nothing ever shifts layout. */
export function PostMediaGrid({ items, onOpen }: PostMediaGridProps) {
  if (items.length === 0) return null;

  if (items.length === 1) return <SingleMedia item={items[0]} onOpen={onOpen} />;

  if (items.length === 2) {
    return (
      <div className={cn(FRAME, "grid max-h-[280px] grid-cols-2 gap-1.5")}>
        {items.map((item, index) => (
          <Tile key={index} item={item} index={index} onOpen={onOpen} className="min-h-[160px]" />
        ))}
      </div>
    );
  }

  if (items.length === 3) {
    return (
      <div className={cn(FRAME, "grid max-h-[320px] grid-cols-2 gap-1.5")}>
        <Tile item={items[0]} index={0} onOpen={onOpen} className="row-span-2 min-h-[240px]" />
        <div className="grid h-full grid-rows-2 gap-1.5">
          {items.slice(1, 3).map((item, index) => (
            <Tile key={index} item={item} index={index + 1} onOpen={onOpen} className="min-h-[110px]" />
          ))}
        </div>
      </div>
    );
  }

  const extra = items.length - 4;

  return (
    <div className={cn(FRAME, "grid max-h-[350px] grid-cols-2 grid-rows-2 gap-1.5")}>
      {items.slice(0, 4).map((item, index) => (
        <Tile key={index} item={item} index={index} onOpen={onOpen} className="min-h-[120px]" overlay={index === 3 && extra > 0 ? `+${extra}` : undefined} />
      ))}
    </div>
  );
}

function SingleMedia({ item, onOpen }: { item: PostMediaItem; onOpen: (index: number) => void }) {
  const { t } = useTranslation();

  if (item.kind === "video") {
    return (
      <div className="group/video relative mt-2">
        <VideoPlayer src={item.url} poster={item.posterUrl ?? posterOf(item.url)} width={item.width} height={item.height} className="max-h-[420px]" />
        <button
          type="button"
          aria-label={t("media.openVideo", { n: 1 })}
          onClick={() => onOpen(0)}
          className="absolute top-2 right-2 flex size-8 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover/video:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
        >
          <Maximize2 className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div className={cn(FRAME, "relative max-h-[350px]", aspectClassOf(item.width, item.height))}>
      <button type="button" onClick={() => onOpen(0)} className={TILE}>
        <MediaImage src={item.url} alt="Post attachment" fill sizes={SINGLE_SIZES} className="object-cover" />
      </button>
    </div>
  );
}

function Tile({
  item,
  index,
  onOpen,
  className,
  overlay,
}: {
  item: PostMediaItem;
  index: number;
  onOpen: (index: number) => void;
  className?: string;
  overlay?: string;
}) {
  const isVideo = item.kind === "video";
  const source = isVideo ? (item.posterUrl ?? posterOf(item.url)) : item.url;

  return (
    <button type="button" onClick={() => onOpen(index)} className={cn(TILE, className)}>
      {source ? (
        <MediaImage src={source} alt={isVideo ? `Video ${index + 1}` : `Attachment ${index + 1}`} fill sizes={TILE_SIZES} className="object-cover" />
      ) : (
        <span className="absolute inset-0 bg-zinc-300 dark:bg-zinc-800" />
      )}
      {isVideo && (
        <span className="absolute top-1/2 left-1/2 flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white">
          <Play className="size-5" />
        </span>
      )}
      {overlay && <span className="absolute inset-0 flex select-none items-center justify-center bg-black/60 text-lg font-bold text-white">{overlay}</span>}
    </button>
  );
}

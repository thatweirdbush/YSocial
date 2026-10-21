"use client";

import { ChevronLeft, ChevronRight, Maximize2, Minimize2, X } from "lucide-react";
import React, { useEffect, useState } from "react";

import { MediaImage } from "@/components/shared/media-image";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { videoCoordinator } from "@/lib/media/video-coordinator";

import type { PostMediaItem } from "../types";

interface PostLightboxProps {
  items: PostMediaItem[];
  /** Open item index; null = closed. */
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

const FALLBACK_SIZE = { width: 1600, height: 1200 };

/** Fullscreen-capable media viewer: images and videos (with controls), paging for multi-media posts. */
export function PostLightbox({ items, index, onIndexChange, onClose }: PostLightboxProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const active = index === null ? null : (items[index] ?? null);
  const isOpen = active !== null;

  // Monitor fullscreen API events to maintain exact UI states
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  // Feed videos stay paused while the viewer is open (also if the card unmounts while open)
  useEffect(() => {
    if (!isOpen) return;

    const coordinator = videoCoordinator();
    coordinator.suspend("lightbox");
    return () => coordinator.resume("lightbox");
  }, [isOpen]);

  const close = () => {
    onClose();
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  };

  const handlePrev = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (index === null) return;
    onIndexChange((index - 1 + items.length) % items.length);
  };

  const handleNext = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (index === null) return;
    onIndexChange((index + 1) % items.length);
  };

  const toggleFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error("Fullscreen error:", err);
      });
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-screen h-screen max-w-none sm:max-w-none max-h-none sm:max-h-none m-0 p-0 bg-black/95 border-none rounded-none outline-none flex flex-col items-center justify-center z-50"
      >
        {/* Top Toolbar Actions */}
        <div className="absolute top-6 right-6 z-55 flex items-center gap-4">
          <button onClick={toggleFullscreen} className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all active:scale-90">
            {isFullscreen ? <Minimize2 className="size-5" /> : <Maximize2 className="size-5" />}
          </button>

          <button onClick={close} className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all active:scale-90">
            <X className="size-5" />
          </button>
        </div>

        {items.length > 1 && (
          <button
            onClick={handlePrev}
            className="absolute left-6 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all active:scale-80 z-55 hidden md:block"
          >
            <ChevronLeft className="size-6 stroke-[3px]" />
          </button>
        )}

        {active?.kind === "video" && (
          <video
            key={active.url}
            src={active.url}
            poster={active.posterUrl}
            controls
            autoPlay
            playsInline
            className="max-h-[85vh] max-w-[90vw] select-none"
          />
        )}

        {active?.kind === "image" && (
          <MediaImage
            key={active.url}
            src={active.url}
            alt="Full resolution viewer"
            width={active.width ?? FALLBACK_SIZE.width}
            height={active.height ?? FALLBACK_SIZE.height}
            sizes="90vw"
            className="h-auto max-h-[85vh] w-auto max-w-[90vw] select-none object-contain"
          />
        )}

        {items.length > 1 && (
          <button
            onClick={handleNext}
            className="absolute right-6 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all active:scale-80 z-55 hidden md:block"
          >
            <ChevronRight className="size-6 stroke-[3px]" />
          </button>
        )}

        {items.length > 1 && index !== null && (
          <div className="absolute bottom-6 px-4 py-1.5 rounded-full bg-white/10 text-white text-xs font-semibold tracking-wider z-55">
            {index + 1} / {items.length}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

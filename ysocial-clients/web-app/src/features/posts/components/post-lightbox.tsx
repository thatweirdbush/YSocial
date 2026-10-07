"use client";

import { ChevronLeft, ChevronRight, Maximize2, Minimize2, X } from "lucide-react";
import React, { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface PostLightboxProps {
  images: string[];
  /** Open image index; null = closed. */
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

/** Fullscreen-capable media viewer with paging for multi-image posts. */
export function PostLightbox({ images, index, onIndexChange, onClose }: PostLightboxProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);

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

  const close = () => {
    onClose();
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => { });
    }
  };

  const handlePrevImage = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (index === null) return;
    onIndexChange((index - 1 + images.length) % images.length);
  };

  const handleNextImage = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (index === null) return;
    onIndexChange((index + 1) % images.length);
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

  const activeImage = index === null ? null : images[index];

  return (
    <Dialog
      open={activeImage !== null}
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
          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all active:scale-90"
          >
            {isFullscreen ? <Minimize2 className="size-5" /> : <Maximize2 className="size-5" />}
          </button>

          {/* Close Button */}
          <button
            onClick={close}
            className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all active:scale-90"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Left navigation arrows for multi-image lightbox */}
        {images.length > 1 && (
          <button
            onClick={handlePrevImage}
            className="absolute left-6 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all active:scale-80 z-55 hidden md:block"
          >
            <ChevronLeft className="size-6 stroke-[3px]" />
          </button>
        )}

        {/* Main high-resolution image container */}
        {activeImage && (
          <img
            src={activeImage}
            alt="Full resolution viewer"
            className="max-w-[90vw] max-h-[85vh] object-contain select-none transition-transform duration-300"
          />
        )}

        {/* Right navigation arrows for multi-image lightbox */}
        {images.length > 1 && (
          <button
            onClick={handleNextImage}
            className="absolute right-6 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all active:scale-80 z-55 hidden md:block"
          >
            <ChevronRight className="size-6 stroke-[3px]" />
          </button>
        )}

        {/* Image pagination counter at the bottom */}
        {images.length > 1 && index !== null && (
          <div className="absolute bottom-6 px-4 py-1.5 rounded-full bg-white/10 text-white text-xs font-semibold tracking-wider z-55">
            {index + 1} / {images.length}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

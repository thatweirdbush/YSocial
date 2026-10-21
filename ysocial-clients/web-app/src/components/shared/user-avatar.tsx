"use client";

import { useState } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

import { MediaImage } from "./media-image";

interface UserAvatarProps {
  /** Absent or broken = the initial stays visible. */
  src?: string | null;
  /** First letter is the fallback initial. */
  name: string;
  /** Avatar root classes (size, border, ring...). */
  className?: string;
  /** Initial classes (background, text size). */
  fallbackClassName?: string;
  /** `sizes` hint for the loader; avatars are small, so the default is a fixed 96px. */
  sizes?: string;
  alt?: string;
}

/**
 * Avatar with the initial UNDER a Next `Image`: while the picture loads, or when it fails, the initial shows.
 * Replaces the Radix `AvatarImage` call sites (`components/ui/avatar.tsx` stays untouched).
 */
export function UserAvatar({ src, name, className, fallbackClassName, sizes = "96px", alt = "" }: UserAvatarProps) {
  // The failed url is remembered, so a NEW src is tried again
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const initial = name.trim().charAt(0).toUpperCase() || "U";
  const showImage = Boolean(src) && src !== failedSrc;

  return (
    <Avatar className={className}>
      <AvatarFallback className={cn("bg-zinc-200 text-xs font-semibold dark:bg-zinc-800", fallbackClassName)}>{initial}</AvatarFallback>
      {showImage && src && (
        <MediaImage
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          className="aspect-square rounded-full object-cover"
          onError={() => setFailedSrc(src)}
        />
      )}
    </Avatar>
  );
}

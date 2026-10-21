"use client";

import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useTranslation } from "@/hooks/use-translation";
import { aspectClassOf } from "@/lib/media/aspect";
import { type CoordinatorHandle, videoCoordinator } from "@/lib/media/video-coordinator";
import { useUIStore, useVideoMuted } from "@/lib/store/ui-store";
import { cn } from "@/lib/utils";

interface VideoPlayerProps {
  src: string;
  /** Frame 0 (BE `posterUrl`). */
  poster?: string | null;
  /** Intrinsic size: reserves the box before the video loads (no layout shift). */
  width?: number | null;
  height?: number | null;
  className?: string;
  /** Test seam: defaults to the app-wide coordinator. */
  coordinator?: ReturnType<typeof videoCoordinator>;
}

const THRESHOLDS = [0, 0.25, 0.5, 0.6, 0.75, 1];

const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Feed video: muted autoplay of the most visible one (the app-wide coordinator arbitrates), a sound toggle that is a SESSION
 * preference for the next videos too, and a user pause that sticks until the video leaves and re-enters the view.
 */
export function VideoPlayer({ src, poster, width, height, className, coordinator }: VideoPlayerProps) {
  const { t } = useTranslation();
  const muted = useVideoMuted();
  const videoRef = useRef<HTMLVideoElement>(null);
  const handleRef = useRef<CoordinatorHandle | null>(null);
  const [paused, setPaused] = useState(true);
  const [userPaused, setUserPaused] = useState(false);
  // A blocked play() retries muted; this never touches the stored preference
  const [forcedMuted, setForcedMuted] = useState(false);
  const [reducedMotion] = useState(prefersReducedMotion);
  const effectiveMuted = muted || forcedMuted;

  // The element's muted flag is a property (the React attribute is not kept in sync)
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = effectiveMuted;
  }, [effectiveMuted]);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;

    const arbiter = coordinator ?? videoCoordinator();
    const startPlayback = () => {
      setPaused(false);
      Promise.resolve(element.play()).catch(() => {
        // Autoplay with sound is refused by browsers: fall back to muted and try once more
        setForcedMuted(true);
        element.muted = true;
        Promise.resolve(element.play()).catch(() => setPaused(true));
      });
    };

    const handle = arbiter.register({
      play: startPlayback,
      pause: () => {
        element.pause();
        setPaused(true);
      },
    });
    handleRef.current = handle;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (entry) handle.report(entry.intersectionRatio, entry.boundingClientRect.top);
      },
      { threshold: THRESHOLDS },
    );
    observer.observe(element);

    return () => {
      observer.disconnect();
      handle.unregister();
      handleRef.current = null;
    };
  }, [coordinator, src]);

  const togglePlayback = () => {
    const handle = handleRef.current;
    if (!handle) return;

    if (paused) {
      setUserPaused(false);
      handle.userPlayed();
    } else {
      setUserPaused(true);
      handle.userPaused();
    }
  };

  const toggleSound = () => {
    if (forcedMuted) {
      // The click is the user gesture that lets sound play
      setForcedMuted(false);
      useUIStore.getState().actions.setVideoMuted(false);
      return;
    }

    useUIStore.getState().actions.toggleVideoMuted();
  };

  const showPlayButton = paused && (userPaused || reducedMotion);

  return (
    <div className={cn("relative w-full overflow-hidden rounded-2xl bg-zinc-100 dark:bg-zinc-900", aspectClassOf(width, height), className)}>
      <video
        ref={videoRef}
        src={src}
        poster={poster ?? undefined}
        muted={effectiveMuted}
        loop
        playsInline
        preload="metadata"
        onClick={togglePlayback}
        className="size-full cursor-pointer object-cover"
      />
      {showPlayButton && (
        <button
          type="button"
          aria-label={t("media.play")}
          onClick={togglePlayback}
          className="absolute top-1/2 left-1/2 flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
        >
          <Play className="size-5" />
        </button>
      )}
      {!showPlayButton && !paused && (
        <button
          type="button"
          aria-label={t("media.pause")}
          onClick={togglePlayback}
          className="absolute top-2 left-2 flex size-8 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none hover:opacity-100"
        >
          <Pause className="size-4" />
        </button>
      )}
      <button
        type="button"
        aria-pressed={effectiveMuted}
        aria-label={effectiveMuted ? t("media.unmute") : t("media.mute")}
        onClick={toggleSound}
        className="absolute right-2 bottom-2 flex size-8 items-center justify-center rounded-full bg-black/60 text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
      >
        {effectiveMuted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
      </button>
    </div>
  );
}

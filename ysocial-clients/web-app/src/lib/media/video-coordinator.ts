/**
 * One app-wide arbiter for feed videos: at most one plays at a time, chosen by how much of it is visible.
 * Pure logic (no React): `VideoPlayer` registers a `{ play, pause }` pair and reports its visible ratio.
 */

/** A player needs at least this much of itself visible to play. */
export const PLAY_RATIO = 0.6;
/** Below this ratio a video counts as having left the view (a user pause is forgotten). */
const LEAVE_RATIO = 0.25;

export interface CoordinatedPlayer {
  play: () => void;
  pause: () => void;
}

export interface CoordinatorHandle {
  readonly id: number;
  /** Visible ratio (0..1) and the element's top edge (tie-break: the topmost wins). */
  report: (ratio: number, top: number) => void;
  /** The user paused: stays paused until the video leaves and re-enters the view. */
  userPaused: () => void;
  /** The user pressed play: wins the arbitration even below the threshold or under reduced motion. */
  userPlayed: () => void;
  unregister: () => void;
}

interface Entry {
  id: number;
  player: CoordinatedPlayer;
  ratio: number;
  top: number;
  userPaused: boolean;
  userForced: boolean;
  playing: boolean;
}

interface CoordinatorOptions {
  /** `prefers-reduced-motion: reduce` -> nothing autoplays. */
  reducedMotion?: () => boolean;
}

const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function createVideoCoordinator(options: CoordinatorOptions = {}) {
  const reducedMotion = options.reducedMotion ?? prefersReducedMotion;
  const entries = new Map<number, Entry>();
  const suspended = new Set<string>();
  let nextId = 1;
  let playingId: number | null = null;

  const isCandidate = (entry: Entry): boolean => !entry.userPaused && (entry.userForced || (entry.ratio >= PLAY_RATIO && !reducedMotion()));

  // Forced (user play) first, then the most visible, then the topmost
  const better = (a: Entry, b: Entry): boolean => {
    if (a.userForced !== b.userForced) return a.userForced;
    if (a.ratio !== b.ratio) return a.ratio > b.ratio;
    return a.top < b.top;
  };

  function arbitrate() {
    const winner = suspended.size > 0 ? undefined : [...entries.values()].filter(isCandidate).reduce<Entry | undefined>((best, entry) => (!best || better(entry, best) ? entry : best), undefined);

    for (const entry of entries.values()) {
      if (entry === winner) continue;
      entry.playing = false;
      entry.player.pause();
    }

    playingId = winner?.id ?? null;
    if (winner && !winner.playing) {
      winner.playing = true;
      winner.player.play();
    }
  }

  function register(player: CoordinatedPlayer): CoordinatorHandle {
    const entry: Entry = { id: nextId++, player, ratio: 0, top: 0, userPaused: false, userForced: false, playing: false };
    entries.set(entry.id, entry);

    return {
      id: entry.id,
      report(ratio, top) {
        entry.ratio = ratio;
        entry.top = top;
        if (ratio < LEAVE_RATIO) {
          entry.userPaused = false;
          entry.userForced = false;
        }
        arbitrate();
      },
      userPaused() {
        entry.userPaused = true;
        entry.userForced = false;
        arbitrate();
      },
      userPlayed() {
        entry.userPaused = false;
        entry.userForced = true;
        arbitrate();
      },
      unregister() {
        entries.delete(entry.id);
        arbitrate();
      },
    };
  }

  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") suspend("hidden");
    else resume("hidden");
  };

  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibilityChange);

  function suspend(reason: string) {
    suspended.add(reason);
    arbitrate();
  }

  function resume(reason: string) {
    suspended.delete(reason);
    arbitrate();
  }

  return {
    register,
    /** Pauses every video for `reason` (lightbox open, tab hidden); they stay paused until every reason is resumed. */
    suspend,
    resume,
    playingId: () => playingId,
    size: () => entries.size,
    dispose: () => {
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibilityChange);
    },
  };
}

/** The coordinator of the running app (created on first use so server rendering never touches `document`). */
let shared: ReturnType<typeof createVideoCoordinator> | undefined;

export function videoCoordinator(): ReturnType<typeof createVideoCoordinator> {
  shared ??= createVideoCoordinator();
  return shared;
}

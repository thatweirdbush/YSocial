"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { isApiError } from "@/lib/api-error";
import { compressImage } from "@/lib/media/compress-image";
import { discardMedia, type MediaPurposeName, type UploadedMedia, uploadMedia } from "@/lib/media/media-api";
import { checkAggregate, checkCandidate, kindOfFile, type MediaKindName, type MediaRejection } from "@/lib/media/media-limits";

export type QueueItemError = MediaRejection | { code: "busy" } | { code: "unavailable" } | { code: "network" } | { code: "server"; message?: string };

export interface QueueItem {
  localId: string;
  fileName: string;
  kind: MediaKindName;
  /** Object URL for the immediate preview (revoked on remove / clear / unmount). */
  previewUrl: string;
  status: "compressing" | "uploading" | "ready" | "error";
  /** Set once `ready`. */
  media?: UploadedMedia;
  /** Size of the file that is (being) uploaded, after compression. */
  size?: number;
  error?: QueueItemError;
}

interface Options {
  purpose: MediaPurposeName;
  /** Called for a file refused before it is queued (type, count, video size). */
  onReject?: (rejection: MediaRejection) => void;
}

/** 429 = the BE still holds this user's upload slot (e.g. while it cleans up an aborted one): wait `Retry-After` and try again. */
const BUSY_RETRY_MS = 5_000;
const BUSY_RETRIES = 3;

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done);
  });

/** First message of the BE validation answer (`errors.files`), else its detail. */
const serverMessage = (error: { errors?: Record<string, string[]>; detail?: string }): string | undefined => error.errors?.files?.[0] ?? error.detail;

function classify(error: unknown): QueueItemError {
  if (!isApiError(error)) return { code: "server" };
  if (error.kind === "network") return { code: "network" };
  if (error.status === 503) return { code: "unavailable" };
  if (error.status === 429) return { code: "busy" };
  return { code: "server", message: serverMessage(error) };
}

/**
 * Upload queue of the composer and the avatar picker: preview at once, optional client compression, files uploaded ONE BY ONE
 * (the BE allows a single in-flight upload per user) as Pending assets. Submit uses `mediaIds` only while `!isBusy`.
 * Removing or discarding tells the BE (best effort); the BE sweep removes whatever is still abandoned.
 */
export function useMediaUploadQueue({ purpose, onReject }: Options) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [unavailable, setUnavailable] = useState(false);

  const itemsRef = useRef<QueueItem[]>([]);
  const files = useRef(new Map<string, File>());
  const waiting = useRef<string[]>([]);
  const aborts = useRef(new Map<string, AbortController>());
  const cancelled = useRef(new Set<string>());
  const running = useRef(false);
  const counter = useRef(0);
  const onRejectRef = useRef(onReject);

  useEffect(() => {
    onRejectRef.current = onReject;
  });

  const commit = useCallback((next: QueueItem[]) => {
    itemsRef.current = next;
    setItems(next);
  }, []);

  const patch = useCallback(
    (localId: string, change: Partial<QueueItem>) => {
      commit(itemsRef.current.map((item) => (item.localId === localId ? { ...item, ...change } : item)));
    },
    [commit],
  );

  const process = useCallback(
    async (localId: string) => {
      const item = itemsRef.current.find((entry) => entry.localId === localId);
      const original = files.current.get(localId);
      if (!item || !original || cancelled.current.has(localId)) return;

      let toUpload = original;
      if (item.kind === "image") {
        patch(localId, { status: "compressing", error: undefined });
        toUpload = await compressImage(original).catch(() => original);
        if (cancelled.current.has(localId)) return;
      }

      const others = itemsRef.current.filter((entry) => entry.localId !== localId && entry.status === "ready").map((entry) => entry.size ?? 0);
      const rejection = checkAggregate(others, toUpload.size, item.kind);
      if (rejection) {
        patch(localId, { status: "error", error: rejection, size: toUpload.size });
        return;
      }

      const controller = new AbortController();
      aborts.current.set(localId, controller);
      patch(localId, { status: "uploading", error: undefined, size: toUpload.size });

      try {
        for (let attempt = 0; ; attempt++) {
          try {
            const media = await uploadMedia(toUpload, purpose, controller.signal);

            if (cancelled.current.has(localId)) {
              // Removed while uploading: the asset exists now, so clean it up
              void discardMedia(media.id);
              return;
            }

            setUnavailable(false);
            patch(localId, { status: "ready", media });
            return;
          } catch (error) {
            if (cancelled.current.has(localId)) return;

            const failure = classify(error);
            if (failure.code === "busy" && attempt < BUSY_RETRIES) {
              await sleep(BUSY_RETRY_MS, controller.signal);
              if (cancelled.current.has(localId)) return;
              continue;
            }

            if (failure.code === "unavailable") setUnavailable(true);
            patch(localId, { status: "error", error: failure });
            return;
          }
        }
      } finally {
        aborts.current.delete(localId);
      }
    },
    [patch, purpose],
  );

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;

    try {
      let next = waiting.current.shift();
      while (next) {
        await process(next);
        next = waiting.current.shift();
      }
    } finally {
      running.current = false;
    }
  }, [process]);

  const addFiles = useCallback(
    (incoming: readonly File[]) => {
      const added: QueueItem[] = [];

      for (const file of incoming) {
        const rejection = checkCandidate(itemsRef.current.length + added.length, file);
        if (rejection) {
          onRejectRef.current?.(rejection);
          continue;
        }

        const kind = kindOfFile(file) as MediaKindName;
        const localId = `media-${++counter.current}`;
        files.current.set(localId, file);
        waiting.current.push(localId);
        added.push({ localId, fileName: file.name, kind, previewUrl: URL.createObjectURL(file), status: kind === "image" ? "compressing" : "uploading" });
      }

      if (added.length === 0) return;

      commit([...itemsRef.current, ...added]);
      void run();
    },
    [commit, run],
  );

  const release = useCallback((item: QueueItem, discard: boolean) => {
    cancelled.current.add(item.localId);
    aborts.current.get(item.localId)?.abort();
    waiting.current = waiting.current.filter((id) => id !== item.localId);
    files.current.delete(item.localId);
    URL.revokeObjectURL(item.previewUrl);

    if (discard && item.media) void discardMedia(item.media.id);
  }, []);

  const remove = useCallback(
    (localId: string) => {
      const item = itemsRef.current.find((entry) => entry.localId === localId);
      if (!item) return;

      release(item, true);
      commit(itemsRef.current.filter((entry) => entry.localId !== localId));
    },
    [commit, release],
  );

  const retry = useCallback(
    (localId: string) => {
      const item = itemsRef.current.find((entry) => entry.localId === localId);
      if (!item || item.status !== "error" || !files.current.has(localId)) return;

      patch(localId, { status: item.kind === "image" ? "compressing" : "uploading", error: undefined });
      waiting.current.push(localId);
      void run();
    },
    [patch, run],
  );

  /** Composer closed or discarded: every asset not used by a post is removed on the BE. */
  const discardAll = useCallback(() => {
    for (const item of itemsRef.current) release(item, true);
    commit([]);
    setUnavailable(false);
  }, [commit, release]);

  /** After a successful post: the assets are attached now, so only the local state goes (NO discard). */
  const clear = useCallback(() => {
    for (const item of itemsRef.current) release(item, false);
    commit([]);
    setUnavailable(false);
  }, [commit, release]);

  // The page is going away: tell the BE with keepalive, it outlives the unload
  useEffect(() => {
    const onPageHide = (event: PageTransitionEvent) => {
      // Going to the back/forward cache: the page may come back with these items, so they must stay valid
      if (event.persisted) return;

      for (const item of itemsRef.current) {
        if (item.media) void discardMedia(item.media.id, { keepalive: true });
      }
    };

    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, []);

  // Unmount (navigated away, composer closed): previews go, and assets nobody used go back to the BE; after a successful
  // post `clear()` already emptied the list, so nothing attached is ever discarded here
  useEffect(
    () => () => {
      for (const item of itemsRef.current) {
        URL.revokeObjectURL(item.previewUrl);
        if (item.media) void discardMedia(item.media.id, { keepalive: true });
      }
    },
    [],
  );

  const mediaIds = useMemo(() => items.flatMap((item) => (item.status === "ready" && item.media?.id ? [item.media.id] : [])), [items]);
  const isBusy = useMemo(() => items.some((item) => item.status === "compressing" || item.status === "uploading"), [items]);
  const hasError = useMemo(() => items.some((item) => item.status === "error"), [items]);

  return { items, mediaIds, isBusy, hasError, unavailable, addFiles, remove, retry, discardAll, clear };
}

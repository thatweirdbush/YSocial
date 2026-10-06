import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useFollowedIds } from "@/features/profile";
import { useIncomingBuffer, usePostStore } from "../store/post-store";
import type { FeedTab, PendingFeed, PostAuthor, PostItem } from "../types";
import { getPendingFeed } from "../utils/pending-feed";

const PILL_AVATARS = 3;
const NOTHING_PENDING: PendingFeed & { authors: PostAuthor[] } = { ids: [], overflow: false, authors: [] };

/**
 * Pending posts above `tab` for the current viewer. Subscribes only to buffered posts (not the whole cache)
 * and to the complete follow set; "following" stays empty until that set is loaded (never guessed).
 */
export function usePendingFeed(tab: FeedTab): PendingFeed & { authors: PostAuthor[] } {
  const buffer = useIncomingBuffer();
  const buffered = usePostStore(useShallow((state) => state.incoming.map((id) => state.posts[id])));
  const followed = useFollowedIds();

  return useMemo(() => {
    if (tab === "following" && !followed.loaded) return NOTHING_PENDING;
    const posts: Record<string, PostItem> = {};
    for (const post of buffered) if (post) posts[post.id] = post;
    const pending = getPendingFeed(posts, buffer, tab, followed.ids);
    return { ...pending, authors: pending.ids.slice(0, PILL_AVATARS).map((id) => posts[id].user) };
  }, [tab, buffer, buffered, followed]);
}

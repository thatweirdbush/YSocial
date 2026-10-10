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
  const excluded = usePostStore((state) => state.excludedAuthors);
  const followed = useFollowedIds();

  return useMemo(() => {
    if (tab === "following" && !followed.loaded) return NOTHING_PENDING;
    const posts: Record<string, PostItem> = {};
    // Excluded authors never count, even if their posts were buffered before the exclusion landed
    for (const post of buffered) if (post && !excluded[post.user.id]) posts[post.id] = post;
    const pending = getPendingFeed(posts, buffer, tab, followed.ids);
    // Distinct authors, newest first: several posts by one author show one avatar
    const authors = new Map<string, PostAuthor>();
    for (const id of pending.ids) {
      if (authors.size === PILL_AVATARS) break;
      const user = posts[id].user;
      if (!authors.has(user.id)) authors.set(user.id, user);
    }
    return { ...pending, authors: [...authors.values()] };
  }, [tab, buffer, buffered, excluded, followed]);
}

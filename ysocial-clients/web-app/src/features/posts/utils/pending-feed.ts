import type { FeedTab, IncomingBuffer, PendingFeed, PostItem } from "../types";
import { getPostFeedTabs } from "./feed-tabs";

/**
 * New posts waiting above `tab`, classified with the CURRENT follow set (read time), so following an
 * author makes their buffered posts pending without re-buffering. O(incoming).
 */
export function getPendingFeed(
  posts: Record<string, PostItem>,
  buffer: IncomingBuffer,
  tab: FeedTab,
  followedAuthorIds: ReadonlySet<string>,
): PendingFeed {
  const consumed = buffer.consumedIncoming[tab];
  const ids = buffer.incoming.filter((id) => {
    const post = posts[id];
    return post !== undefined && !consumed[id] && getPostFeedTabs(post, followedAuthorIds).includes(tab);
  });

  const dropped = buffer.droppedAuthorIds[tab];
  const overflow = tab === "forYou" ? dropped.length > 0 : dropped.some((id) => followedAuthorIds.has(id));
  return { ids, overflow };
}

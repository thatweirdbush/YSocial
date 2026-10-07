import type { FeedTab, PostItem } from "../types";

/** Feed tabs a post belongs to for a viewer. Shared by the mock feed service and the pending-post pill. */
export function getPostFeedTabs(post: PostItem, followedAuthorIds: ReadonlySet<string>): FeedTab[] {
  if (post.parentId !== undefined) return [];
  return followedAuthorIds.has(post.user.id) ? ["forYou", "following"] : ["forYou"];
}

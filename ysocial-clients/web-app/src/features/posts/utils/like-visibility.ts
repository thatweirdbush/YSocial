import type { PostItem } from "../types";

/** Like count a viewer may see; `null` when the owner hid it. Every rendered like count goes through this. */
export function getVisibleLikeCount(post: PostItem, viewerId: string): number | null {
  return post.hideLikeCount && post.user.id !== viewerId ? null : post.likesCount;
}

import type { PostItem, PostMediaItem } from "../types";

/**
 * The media of a post in display order: uploaded `media` first, else the legacy image urls (mock posts, drafts),
 * else the single legacy `imageUrl` (external GIF). Empty = text post.
 */
export function mediaItemsOf(post: Pick<PostItem, "media" | "imageUrls" | "imageUrl">): PostMediaItem[] {
  if (post.media && post.media.length > 0) return post.media;
  if (post.imageUrls && post.imageUrls.length > 0) return post.imageUrls.map((url) => ({ kind: "image" as const, url }));
  if (post.imageUrl) return [{ kind: "image" as const, url: post.imageUrl }];
  return [];
}

import type { components } from "@/lib/api/generated";

// #region Backend DTOs
type Schemas = components["schemas"];

export type CreatePostRequest = Schemas["CreatePostRequest"];
export type UpdatePostRequest = Schemas["UpdatePostRequest"];
export type SharePostLinkResponse = Schemas["SharePostLinkResponse"];
export type ToggleLikeRequest = Schemas["ToggleLikeRequest"];
export type LikeTargetType = Schemas["LikeTargetType"];
export type AddCommentRequest = Schemas["AddCommentRequest"];
export type UpdateCommentRequest = Schemas["UpdateCommentRequest"];
// #endregion

// #region Domain models
export interface PostAuthor {
  id: string;
  displayName: string;
  username: string;
  avatarUrl?: string;
  isVerified?: boolean;
}

export interface PostItem {
  id: string;
  content: string;
  imageUrl?: string;
  imageUrls?: string[]; // Added supporting multiple media uploads
  createdAt: string;
  likesCount: number;
  commentsCount: number;
  isLikedByCurrentUser: boolean;
  isBookmarkedByCurrentUser: boolean;
  user: PostAuthor;
  /** Set for replies: id of the post being replied to. */
  parentId?: string;
  isEdited?: boolean;
  /** Client-only: optimistic copy still awaiting the server; rendered non-interactive. */
  isPending?: boolean;
}

export type PostAudience = "anyone" | "followers" | "following" | "mention";

export type FeedTab = "forYou" | "following";

export interface FeedPage {
  posts: PostItem[];
  nextPage?: number;
}

export interface PostThread {
  post: PostItem;
  parent?: PostItem;
  /** Direct children, newest first. */
  replies: PostItem[];
  /** replyId → its direct children, newest first (1-level nesting). */
  childReplies: Record<string, PostItem[]>;
}

export type TagSort = "top" | "latest";

export interface HashtagStat {
  /** Most frequent original casing, without `#`. */
  tag: string;
  postsCount: number;
}

export interface TagPage extends HashtagStat {
  posts: PostItem[];
}

export interface CreatePostInput {
  content: string;
  images: string[];
  audience: PostAudience;
}

export interface PostDraft {
  id: string;
  content: string;
  images: string[];
  audience: PostAudience;
  createdAt: number;
}
// #endregion

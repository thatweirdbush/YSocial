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
  /** Root posts only; at most 1 pinned post per author. */
  isPinned?: boolean;
  /** Owner-only setting: other viewers never see the like count. */
  hideLikeCount?: boolean;
  /** Who may see the post; absent = `public`. Not the reply permission (`PostAudience`). */
  visibility?: PostVisibility;
}

/** Why the viewer no longer sees an author's posts in lists: `blocked` covers both directions of a block. */
export type ExclusionReason = "muted" | "blocked";

export type ExcludedAuthors = Record<string, Partial<Record<ExclusionReason, true>>>;

/** Owner-only mutations; at most 1 pending per post. */
export type OwnerOp = "edit" | "delete" | "pin" | "hideLikeCount";

/** New posts waiting above a feed tab. */
export interface PendingFeed {
  ids: string[];
  /** Some pending posts for this tab were dropped by the buffer cap -> refetch instead of merge. */
  overflow: boolean;
}

/** Posts pushed by the new-post stream, shared by both tabs; classified per tab at read time. */
export interface IncomingBuffer {
  /** Post ids, newest first. */
  incoming: string[];
  /** Ids already merged into (or covered by a page-1 load of) each tab. */
  consumedIncoming: Record<FeedTab, Record<string, true>>;
  /** Authors of entries dropped by the cap while still unconsumed for that tab. */
  droppedAuthorIds: Record<FeedTab, string[]>;
}

/** Everything `removePost` changed, so a failed delete can be restored exactly. */
export interface RemovalSnapshot {
  /** Removed posts, root first. */
  posts: PostItem[];
  /** Index of the root in each feed it was in. */
  feedIndex: Partial<Record<FeedTab, number>>;
  /** Index in `incoming`, -1 when absent. */
  incomingIndex: number;
  /** Tabs that had consumed the root's incoming entry. */
  consumedTabs: FeedTab[];
  parentId?: string;
  /** Index in `replyIds[parentId]`, -1 when absent. */
  replyIndex: number;
  /** Child id lists of the removed posts. */
  replyIds: Record<string, string[]>;
  parentDecremented: boolean;
  wasPinned: boolean;
}

/** Post visibility: `closeFriends` posts are shown only to the author's accepted close friends. */
export type PostVisibility = "public" | "closeFriends";

export type PostAudience = "anyone" | "followers" | "following" | "mention";

export type FeedTab = "forYou" | "following";

export interface FeedPage {
  posts: PostItem[];
  nextPage?: number;
}

/** Profile post tabs backed by `fetchUserPosts`; Saved is viewer-owned (`fetchSavedPosts`). */
export type UserPostsTab = "threads" | "replies" | "media";

/** Parent of a reply, kept even when the parent was tombstoned (a deletion marker, never a renderable post). */
export interface ParentReference {
  id: string;
  /** Present only when the parent is still available. */
  author?: PostAuthor;
  deleted: boolean;
}

export interface UserPostsPage {
  posts: PostItem[];
  /** Replies tab only. */
  parents: ParentReference[];
  nextPage?: number;
  /** Private profile the viewer may not see: `posts` is empty. */
  locked: boolean;
}

export interface SavedPostsPage {
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

/** Post search order: relevance (Top tab) or newest first (Posts tab). */
export type PostSearchSort = "relevance" | "latest";

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
  visibility?: PostVisibility;
}

export interface PostDraft {
  id: string;
  content: string;
  images: string[];
  audience: PostAudience;
  /** Absent in drafts saved before close friends existed = public. */
  visibility?: PostVisibility;
  createdAt: number;
}
// #endregion

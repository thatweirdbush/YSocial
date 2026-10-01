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
}

export type PostAudience = "anyone" | "followers" | "following" | "mention";

export interface PostDraft {
  id: string;
  content: string;
  images: string[];
  audience: PostAudience;
  createdAt: number;
}
// #endregion

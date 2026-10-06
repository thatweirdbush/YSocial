import type { components } from "@/lib/api/generated";

// #region Backend DTOs
type Schemas = components["schemas"];

export type UpdateProfileRequest = Schemas["UpdateProfileRequest"];
export type Gender = Schemas["Gender"];
export type SwitchProfileRequest = Schemas["SwitchProfileRequest"];
export type ToggleCloseFriendRequest = Schemas["ToggleCloseFriendRequest"];
// #endregion

// #region Domain models
export type ProfileTab = "posts" | "replies" | "saved";

export interface UserProfile {
  id: string;
  displayName: string;
  username: string;
  email?: string;
  bio?: string;
  avatarUrl?: string;
  coverUrl?: string;
  followersCount: number;
  followingCount: number;
  isFollowing: boolean;
  isVerified?: boolean;
}

/** Profile data shared by every viewer; `isFollowing` lives in the viewer-scoped follow projection. */
export type UserProfileBase = Omit<UserProfile, "isFollowing">;

/** One viewer's follow projection in `user-store`. */
export interface ViewerFollows {
  ids: Record<string, true>;
  /** Ids whose follow state was fetched or toggled for this viewer (trusted even before `loaded`). */
  known: Record<string, true>;
  /** True once the complete follow set was loaded (not just ids seen in fetched profiles). */
  loaded: boolean;
  /** Bumped by every local toggle; a follow-set load started before a toggle is discarded. */
  version: number;
}

export interface FollowerUser {
  id: string;
  displayName: string;
  username: string;
  avatarUrl?: string;
  isFollowing: boolean;
}
// #endregion

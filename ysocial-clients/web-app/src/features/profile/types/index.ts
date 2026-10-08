import type { components } from "@/lib/api/generated";

// #region Backend DTOs
type Schemas = components["schemas"];

export type UpdateProfileRequest = Schemas["UpdateProfileRequest"];
export type Gender = Schemas["Gender"];
export type SwitchProfileRequest = Schemas["SwitchProfileRequest"];
export type ToggleCloseFriendRequest = Schemas["ToggleCloseFriendRequest"];
// #endregion

// #region Domain models
export type ProfileTab = "threads" | "replies" | "media" | "saved";

export type FollowListKind = "followers" | "following";

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

/** Mock DB row: shared profile data without counts (counts derive from the follow graph, spec D6). */
export type StoredUser = Omit<UserProfileBase, "followersCount" | "followingCount">;

export interface FollowListQuery {
  query?: string;
  page?: number;
}

export interface FollowListPage {
  users: UserProfile[];
  nextPage?: number;
}

export interface ProfilePatch {
  displayName: string;
  bio?: string;
  avatarUrl?: string;
}

export type ViewerUserInput = Pick<UserProfileBase, "id" | "username" | "displayName"> &
  Partial<Pick<UserProfileBase, "bio" | "avatarUrl">>;

export const PROFILE_DISPLAY_NAME_MIN = 2;
export const PROFILE_DISPLAY_NAME_MAX = 50;
export const PROFILE_BIO_MAX = 160;

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

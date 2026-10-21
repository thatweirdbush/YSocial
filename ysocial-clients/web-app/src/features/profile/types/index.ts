import type { components } from "@/lib/api/generated";

// #region Backend DTOs
type Schemas = components["schemas"];

export type UpdateProfileRequest = Schemas["UpdateProfileRequest"];
export type Gender = Schemas["Gender"];
export type SwitchProfileRequest = Schemas["SwitchProfileRequest"];
export type ToggleCloseFriendRequest = Schemas["ToggleCloseFriendRequest"];
export type UserProfileDto = Schemas["UserProfileDto"];
export type UserProfileDtoPagedResponse = Schemas["UserProfileDtoPagedResponse"];
export type FollowListPageDto = Schemas["FollowListPageDto"];
export type RelationSetsDto = Schemas["RelationSetsDto"];
// #endregion

// #region Domain models
export type ProfileTab = "threads" | "replies" | "media" | "saved";

export type FollowListKind = "followers" | "following";

/** Follow edge status (BE `FollowStatus`). */
export type FollowStatus = "none" | "pending" | "accepted";

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
  isVerified?: boolean;
  isPrivate: boolean;
  /** Viewer projection. `isFollowing` = `followStatus === "accepted"`. */
  isFollowing: boolean;
  followStatus: FollowStatus;
  /** Viewer marked this user as a close friend (effective only while the follow is accepted). */
  viewerMarkedCloseFriend: boolean;
  isMuted: boolean;
  /** Viewer blocked this user. */
  isBlocked: boolean;
  /** This user blocked the viewer. */
  isBlockedBy: boolean;
}

type ViewerField =
  | "isFollowing"
  | "followStatus"
  | "viewerMarkedCloseFriend"
  | "isMuted"
  | "isBlocked"
  | "isBlockedBy";

/** Profile data shared by every viewer; viewer fields live in the viewer-scoped projections. */
export type UserProfileBase = Omit<UserProfile, ViewerField>;

/** Mock DB row: shared profile data without counts & privacy (both derive from the mock graphs, spec D6 & D17). */
export type StoredUser = Omit<UserProfileBase, "followersCount" | "followingCount" | "isPrivate">;

export type RequestDecision = "accept" | "decline";

/** The viewer's relation flags for one user, read from the relation store. */
export interface RelationFlags {
  isMuted: boolean;
  /** Viewer blocked the user. */
  isBlocked: boolean;
  /** The user blocked the viewer. */
  isBlockedBy: boolean;
  /** Viewer set the close friend flag (effective only while the follow is accepted). */
  markedCloseFriend: boolean;
}

/** Viewer's relation sets loaded once per session (spec D24); drive optimistic projections. */
export interface RelationSets {
  blocked: string[];
  /** Users who blocked the viewer. */
  blockedBy: string[];
  muted: string[];
  /** Every flag the viewer set, dormant ones included; "effective" = flag AND an accepted follow (spec D7). */
  closeFriends: string[];
  isPrivate: boolean;
  requestCount: number;
}

export interface RelationListQuery {
  query?: string;
  page?: number;
}

export const RELATION_PAGE_SIZE = 20;

export interface FollowListQuery {
  query?: string;
  page?: number;
}

export interface FollowListPage {
  users: UserProfile[];
  nextPage?: number;
  /** Private profile the viewer may not see: `users` is empty (not an error). */
  locked?: boolean;
}

export interface ProfilePatch {
  displayName: string;
  bio?: string;
  /** Keep = the current url; absent = remove. Ignored when `avatarMediaId` is set. */
  avatarUrl?: string;
  /** A just uploaded Pending avatar asset (real BE): sent WITHOUT `avatarUrl`. */
  avatarMediaId?: string;
}

export type ViewerUserInput = Pick<UserProfileBase, "id" | "username" | "displayName"> &
  Partial<Pick<UserProfileBase, "bio" | "avatarUrl">>;

export const PROFILE_DISPLAY_NAME_MIN = 2;
export const PROFILE_DISPLAY_NAME_MAX = 50;
export const PROFILE_BIO_MAX = 160;

/** One viewer's follow projection in `user-store`. Absent id = `none`. */
export interface ViewerFollows {
  status: Record<string, "pending" | "accepted">;
  /** Ids whose follow state was fetched or changed for this viewer (trusted even before `loaded`). */
  known: Record<string, true>;
  /** True once the complete follow set was loaded (not just ids seen in fetched profiles). */
  loaded: boolean;
  /** Bumped by every local status change; a follow-set load started before a change is discarded. */
  version: number;
}

// #endregion

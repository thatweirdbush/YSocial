import type { FollowStatus, UserProfile, UserProfileBase } from "../types";

const VIEWER_FIELDS = [
  "isFollowing",
  "followStatus",
  "viewerMarkedCloseFriend",
  "isMuted",
  "isBlocked",
  "isBlockedBy",
] as const satisfies ReadonlyArray<keyof UserProfile>;

/** Shared (viewer-independent) part of a projected user. */
export function toUserBase(user: UserProfile): UserProfileBase {
  const base: Partial<UserProfile> = { ...user };
  for (const field of VIEWER_FIELDS) delete base[field];
  return base as UserProfileBase;
}

/** Full profile from shared data & the follow status; other viewer fields default to "no relation". */
export function withViewerDefaults(base: UserProfileBase, followStatus: FollowStatus): UserProfile {
  return {
    ...base,
    isFollowing: followStatus === "accepted",
    followStatus,
    viewerMarkedCloseFriend: false,
    isMuted: false,
    isBlocked: false,
    isBlockedBy: false,
  };
}

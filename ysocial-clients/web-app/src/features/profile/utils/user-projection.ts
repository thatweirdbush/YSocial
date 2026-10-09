import type { FollowStatus, RelationFlags, UserProfile, UserProfileBase } from "../types";

const NO_FLAGS: RelationFlags = { isMuted: false, isBlocked: false, isBlockedBy: false, markedCloseFriend: false };

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

/** Full profile from shared data, the follow status & the relation flags (default: no relation). */
export function withViewerDefaults(base: UserProfileBase, followStatus: FollowStatus, flags: RelationFlags = NO_FLAGS): UserProfile {
  return {
    ...base,
    isFollowing: followStatus === "accepted",
    followStatus,
    // A dormant flag (follow no longer accepted) never counts
    viewerMarkedCloseFriend: flags.markedCloseFriend && followStatus === "accepted",
    isMuted: flags.isMuted,
    isBlocked: flags.isBlocked,
    isBlockedBy: flags.isBlockedBy,
  };
}

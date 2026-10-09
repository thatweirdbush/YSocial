import type { UserProfile } from "../types";

type RequiredFields = Pick<UserProfile, "id" | "displayName" | "username">;

/** Test fixture: a public user with no relation to the viewer; override any field. */
export function makeUserProfile(overrides: RequiredFields & Partial<UserProfile>): UserProfile {
  return {
    followersCount: 0,
    followingCount: 0,
    isPrivate: false,
    isFollowing: false,
    followStatus: "none",
    viewerMarkedCloseFriend: false,
    isMuted: false,
    isBlocked: false,
    isBlockedBy: false,
    ...overrides,
  };
}

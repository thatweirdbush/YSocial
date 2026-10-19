import type { FollowListPage, FollowListPageDto, FollowStatus, UserProfile, UserProfileDto, UserProfileDtoPagedResponse } from "../types";

const toFollowStatus = (value: string | null | undefined): FollowStatus =>
  value === "pending" || value === "accepted" ? value : "none";

/** Nullable DTO -> domain: unknown `followStatus` falls back to `none`; `isFollowing` is derived from it. */
export function toUserProfile(dto: UserProfileDto): UserProfile {
  const followStatus = toFollowStatus(dto.followStatus);
  return {
    id: dto.id,
    displayName: dto.displayName ?? "",
    username: dto.username ?? "",
    bio: dto.bio ?? undefined,
    avatarUrl: dto.avatarUrl ?? undefined,
    coverUrl: dto.coverUrl ?? undefined,
    followersCount: dto.followersCount,
    followingCount: dto.followingCount,
    isVerified: dto.isVerified,
    isPrivate: dto.isPrivate,
    isFollowing: followStatus === "accepted",
    followStatus,
    viewerMarkedCloseFriend: dto.viewerMarkedCloseFriend ?? false,
    isMuted: dto.isMuted ?? false,
    isBlocked: dto.isBlocked ?? false,
    isBlockedBy: dto.isBlockedBy ?? false,
  };
}

export function toFollowListPage(dto: FollowListPageDto | UserProfileDtoPagedResponse): FollowListPage {
  return {
    users: (dto.items ?? []).map(toUserProfile),
    nextPage: dto.hasNextPage ? (dto.page ?? 1) + 1 : undefined,
    locked: "locked" in dto ? dto.locked : false,
  };
}

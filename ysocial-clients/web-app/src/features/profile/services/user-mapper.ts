import { ApiError } from "@/lib/api-error";
import type { FollowListPage, FollowListPageDto, FollowStatus, UserProfile, UserProfileDto, UserProfileDtoPagedResponse } from "../types";

export const toFollowStatus = (value: string | null | undefined): FollowStatus =>
  value === "pending" || value === "accepted" ? value : "none";

/** Swagger marks every field optional (M12): a profile without an id is a contract breach. */
function missingId(): never {
  throw new ApiError({ kind: "http", status: 200, code: "Unknown", detail: "Malformed UserProfileDto: missing id" });
}

/** Nullable DTO -> domain: unknown `followStatus` falls back to `none`; `isFollowing` is derived from it. */
export function toUserProfile(dto: UserProfileDto): UserProfile {
  const followStatus = toFollowStatus(dto.followStatus);
  return {
    id: dto.id || missingId(),
    displayName: dto.displayName ?? "",
    username: dto.username ?? "",
    bio: dto.bio ?? undefined,
    avatarUrl: dto.avatarUrl ?? undefined,
    coverUrl: dto.coverUrl ?? undefined,
    followersCount: dto.followersCount ?? 0,
    followingCount: dto.followingCount ?? 0,
    isVerified: dto.isVerified ?? false,
    isPrivate: dto.isPrivate ?? false,
    isFollowing: followStatus === "accepted",
    followStatus,
    viewerMarkedCloseFriend: dto.viewerMarkedCloseFriend ?? false,
    isMuted: dto.isMuted ?? false,
    isBlocked: dto.isBlocked ?? false,
    // D14: a user who blocked the viewer answers 404, so this never arrives true; never read it
    isBlockedBy: false,
  };
}

export function toFollowListPage(dto: FollowListPageDto | UserProfileDtoPagedResponse): FollowListPage {
  return {
    users: (dto.items ?? []).map(toUserProfile),
    nextPage: dto.hasNextPage ? (dto.page ?? 1) + 1 : undefined,
    locked: "locked" in dto ? (dto.locked ?? false) : false,
  };
}

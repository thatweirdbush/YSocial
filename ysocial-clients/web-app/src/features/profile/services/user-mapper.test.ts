import { describe, expect, it } from "vitest";
import type { FollowListPageDto, UserProfileDto, UserProfileDtoPagedResponse } from "../types";
import { toFollowListPage, toUserProfile } from "./user-mapper";

const dto = (overrides: Partial<UserProfileDto> = {}): UserProfileDto => ({
  id: "0b8f1c52-6a3e-4c53-9b42-5f9d6f7a1e10",
  username: "demo",
  displayName: "Demo",
  bio: null,
  avatarUrl: null,
  coverUrl: null,
  followersCount: 5,
  followingCount: 2,
  isPrivate: false,
  isVerified: true,
  followStatus: "none",
  isFollowing: false,
  viewerMarkedCloseFriend: false,
  isMuted: false,
  isBlocked: false,
  isBlockedBy: false,
  ...overrides,
});

describe("toUserProfile", () => {
  it("maps nulls to undefined & keeps counts/flags", () => {
    const profile = toUserProfile(dto({ followersCount: 9, isPrivate: true }));
    expect(profile).toMatchObject({ displayName: "Demo", username: "demo", followersCount: 9, isPrivate: true, isVerified: true });
    expect(profile.bio).toBeUndefined();
    expect(profile.avatarUrl).toBeUndefined();
    expect(profile.coverUrl).toBeUndefined();
  });

  it("null displayName/username tolerated", () => {
    expect(toUserProfile(dto({ displayName: null, username: null }))).toMatchObject({ displayName: "", username: "" });
  });

  it("followStatus pending/accepted kept, isFollowing derived from accepted", () => {
    expect(toUserProfile(dto({ followStatus: "pending" }))).toMatchObject({ followStatus: "pending", isFollowing: false });
    expect(toUserProfile(dto({ followStatus: "accepted" }))).toMatchObject({ followStatus: "accepted", isFollowing: true });
  });

  it("unknown followStatus -> none", () => {
    expect(toUserProfile(dto({ followStatus: "weird", isFollowing: true }))).toMatchObject({ followStatus: "none", isFollowing: false });
    expect(toUserProfile(dto({ followStatus: null })).followStatus).toBe("none");
  });
});

describe("toFollowListPage", () => {
  const page: FollowListPageDto = { items: [dto()], page: 1, pageSize: 20, totalCount: 1, hasNextPage: true, locked: false };

  it("maps users & nextPage", () => {
    expect(toFollowListPage(page)).toMatchObject({ nextPage: 2, locked: false });
    expect(toFollowListPage(page).users).toHaveLength(1);
  });

  it("keeps locked", () => {
    expect(toFollowListPage({ ...page, items: [], hasNextPage: false, locked: true })).toEqual({
      users: [],
      nextPage: undefined,
      locked: true,
    });
  });

  it("accepts a plain paged response (no locked flag)", () => {
    const plain: UserProfileDtoPagedResponse = { items: null, page: 3, pageSize: 20, totalCount: 0, hasNextPage: false };
    expect(toFollowListPage(plain)).toEqual({ users: [], nextPage: undefined, locked: false });
  });
});

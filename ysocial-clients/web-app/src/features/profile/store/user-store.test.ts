import { beforeEach, describe, expect, it } from "vitest";
import type { UserProfile } from "../types";
import { resetUserStore, useUserStore } from "./user-store";

const user: UserProfile = {
  id: "u1",
  displayName: "Minh Thư",
  username: "minhthu",
  followersCount: 0,
  followingCount: 3,
  isFollowing: false,
};

const actions = () => useUserStore.getState().actions;

beforeEach(() => {
  resetUserStore();
  actions().upsertUsers([user]);
});

describe("user-store", () => {
  it("toggles follow and adjusts the follower count", () => {
    actions().toggleFollow("u1");
    expect(useUserStore.getState().users.u1).toMatchObject({ isFollowing: true, followersCount: 1 });

    actions().toggleFollow("u1");
    expect(useUserStore.getState().users.u1).toMatchObject({ isFollowing: false, followersCount: 0 });
  });

  it("never drops the follower count below 0", () => {
    actions().upsertUsers([{ ...user, isFollowing: true, followersCount: 0 }]);
    actions().toggleFollow("u1");
    expect(useUserStore.getState().users.u1.followersCount).toBe(0);
  });

  it("ignores unknown ids", () => {
    const before = useUserStore.getState();
    actions().toggleFollow("nope");
    expect(useUserStore.getState()).toBe(before);
  });
});

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth/store/auth-store";
import * as service from "../services/user-service";
import type { UserProfile } from "../types";
import { ensureFollowGraph, ensureUser, getFollowedIds, resetUserStore, useFollowedIds, useUser, useUserStore } from "./user-store";

const user: UserProfile = {
  id: "u1",
  displayName: "Minh Thư",
  username: "minhthu",
  followersCount: 0,
  followingCount: 3,
  isFollowing: false,
};

const actions = () => useUserStore.getState().actions;
const isFollowing = (viewerId: string, id: string) => useUserStore.getState().follows[viewerId]?.ids[id] === true;
const signInAs = (id: string) => useAuthStore.setState({ user: { id, email: `${id}@ysocial.dev` } });

beforeEach(() => {
  resetUserStore();
  vi.restoreAllMocks();
  signInAs("v1");
  actions().upsertUsers([user], "v1");
});

afterEach(() => {
  useAuthStore.setState({ user: null });
});

describe("user-store", () => {
  it("stores shared profile data without a follow flag", () => {
    expect(useUserStore.getState().users.u1).not.toHaveProperty("isFollowing");
  });

  it("toggles follow for the viewer and adjusts the shared follower count", () => {
    actions().toggleFollow("v1", "u1");
    expect(isFollowing("v1", "u1")).toBe(true);
    expect(useUserStore.getState().users.u1.followersCount).toBe(1);

    actions().toggleFollow("v1", "u1");
    expect(isFollowing("v1", "u1")).toBe(false);
    expect(useUserStore.getState().users.u1.followersCount).toBe(0);
  });

  it("isolates follow state between viewers", () => {
    actions().upsertUsers([{ ...user, isFollowing: true, followersCount: 5 }], "v2");
    actions().toggleFollow("v1", "u1");

    expect(isFollowing("v1", "u1")).toBe(true);
    expect(isFollowing("v2", "u1")).toBe(true);
    actions().toggleFollow("v2", "u1");
    expect(isFollowing("v1", "u1")).toBe(true);
    expect(isFollowing("v2", "u1")).toBe(false);
  });

  it("never drops the follower count below 0", () => {
    actions().upsertUsers([{ ...user, isFollowing: true, followersCount: 0 }], "v1");
    actions().toggleFollow("v1", "u1");
    expect(useUserStore.getState().users.u1.followersCount).toBe(0);
  });

  it("ignores unknown ids", () => {
    const before = useUserStore.getState();
    actions().toggleFollow("v1", "nope");
    expect(useUserStore.getState()).toBe(before);
  });

  it("applies a loaded follow set only when no local toggle happened meanwhile", () => {
    const version = useUserStore.getState().follows.v1.version;
    actions().toggleFollow("v1", "u1");

    expect(actions().setFollowedIds("v1", ["author-02"], version)).toBe(false);
    expect(getFollowedIds("v1").loaded).toBe(false);

    const current = useUserStore.getState().follows.v1.version;
    expect(actions().setFollowedIds("v1", ["author-02"], current)).toBe(true);
    expect(getFollowedIds("v1")).toEqual({ ids: new Set(["author-02"]), loaded: true });
  });
});

describe("useUser", () => {
  it("projects the current viewer's follow flag", () => {
    actions().toggleFollow("v1", "u1");
    const { result } = renderHook(() => useUser("u1"));
    expect(result.current).toMatchObject({ id: "u1", isFollowing: true, followersCount: 1 });

    act(() => signInAs("v2"));
    expect(result.current).toMatchObject({ id: "u1", isFollowing: false, followersCount: 1 });
  });

  it("keeps the same reference across unrelated store updates", () => {
    const { result } = renderHook(() => useUser("u1"));
    const first = result.current;

    act(() => actions().upsertUsers([{ ...user, id: "u2", username: "other" }], "v1"));
    expect(result.current).toBe(first);
  });

  it("returns undefined for an unknown user", () => {
    const { result } = renderHook(() => useUser("nope"));
    expect(result.current).toBeUndefined();
  });
});

describe("ensureUser", () => {
  it("returns a cached user without calling the service", async () => {
    const spy = vi.spyOn(service, "fetchUser");
    await expect(ensureUser("u1", "v1")).resolves.toMatchObject({ id: "u1", isFollowing: false });
    expect(spy).not.toHaveBeenCalled();
  });

  it("dedupes concurrent requests and upserts the result", async () => {
    const spy = vi.spyOn(service, "fetchUser").mockResolvedValue({ ...user, id: "u9", isFollowing: true });

    const [a, b] = await Promise.all([ensureUser("u9", "v1"), ensureUser("u9", "v1")]);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    expect(useUserStore.getState().users.u9).toBeDefined();
    expect(isFollowing("v1", "u9")).toBe(true);
  });
});

describe("ensureFollowGraph", () => {
  it("loads the complete follow set once per viewer", async () => {
    const spy = vi.spyOn(service, "fetchFollowedIds").mockResolvedValue(["author-02", "author-03"]);

    await Promise.all([ensureFollowGraph("v1"), ensureFollowGraph("v1")]);
    await ensureFollowGraph("v1");

    expect(spy).toHaveBeenCalledTimes(1);
    expect(getFollowedIds("v1")).toEqual({ ids: new Set(["author-02", "author-03"]), loaded: true });
  });

  it("retries once when a local toggle raced the request", async () => {
    const spy = vi.spyOn(service, "fetchFollowedIds").mockImplementation(async () => {
      if (spy.mock.calls.length === 1) actions().toggleFollow("v1", "u1");
      return ["author-02", "u1"];
    });

    await ensureFollowGraph("v1");

    expect(spy).toHaveBeenCalledTimes(2);
    expect(getFollowedIds("v1").loaded).toBe(true);
  });
});

describe("useFollowedIds", () => {
  it("returns the current viewer's follow set and loaded flag", () => {
    actions().toggleFollow("v1", "u1");
    const { result } = renderHook(() => useFollowedIds());

    expect(result.current).toEqual({ ids: new Set(["u1"]), loaded: false });
  });
});

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth/store/auth-store";
import { ApiError } from "@/lib/api-error";
import { __resetBlockGraph } from "@/mocks/block-graph";
import { __resetPrivacy } from "@/mocks/privacy";
import { __resetRelationGraph, getFollowerCount, getFollowStatus, getRequestIds } from "@/mocks/relation-graph";
import { HIDDEN_FOLLOWERS } from "../mocks/mock-users";
import { makeUserProfile } from "../mocks/user-fixtures";
import * as service from "../services/user-service";
import type { FollowStatus, UserProfile } from "../types";
import { resetOpLedger } from "./op-ledger";
import {
  clearViewerFollows,
  commitFollow,
  ensureFollowGraph,
  ensureUser,
  ensureUserByUsername,
  ensureViewerUser,
  getFollowedIds,
  resetUserStore,
  useFollowedIds,
  useFollowState,
  useUser,
  useUserByUsername,
  useUserStore,
} from "./user-store";

const user: UserProfile = makeUserProfile({
  id: "u1",
  displayName: "Minh Thư",
  username: "minhthu",
  followingCount: 3,
});

const withStatus = (base: UserProfile, followStatus: FollowStatus): UserProfile => ({
  ...base,
  followStatus,
  isFollowing: followStatus === "accepted",
});

const actions = () => useUserStore.getState().actions;
const statusOf = (actorId: string, id: string): FollowStatus | undefined => useUserStore.getState().follows[actorId]?.status[id];
const isFollowing = (actorId: string, id: string) => statusOf(actorId, id) === "accepted";
const signInAs = (id: string) => useAuthStore.setState({ user: { id, email: `${id}@ysocial.dev` } });
const followers = (id: string) => useUserStore.getState().users[id].followersCount;

beforeEach(() => {
  resetUserStore();
  resetOpLedger();
  vi.restoreAllMocks();
  signInAs("v1");
  actions().upsertUsers([user], "v1");
});

afterEach(() => {
  useAuthStore.setState({ user: null });
});

describe("user-store", () => {
  it("stores shared profile data without any viewer field", () => {
    const stored = useUserStore.getState().users.u1;

    for (const field of ["isFollowing", "followStatus", "viewerMarkedCloseFriend", "isMuted", "isBlocked", "isBlockedBy"]) {
      expect(stored).not.toHaveProperty(field);
    }
    expect(stored.isPrivate).toBe(false);
  });

  it("counts a follower only when the status crosses the accepted boundary", () => {
    actions().setFollowStatus("v1", "u1", "pending");
    expect(statusOf("v1", "u1")).toBe("pending");
    expect(followers("u1")).toBe(0);

    actions().setFollowStatus("v1", "u1", "accepted");
    expect(followers("u1")).toBe(1);

    actions().setFollowStatus("v1", "u1", "pending");
    expect(followers("u1")).toBe(0);

    actions().setFollowStatus("v1", "u1", "accepted");
    actions().setFollowStatus("v1", "u1", "none");
    expect(statusOf("v1", "u1")).toBeUndefined();
    expect(followers("u1")).toBe(0);
  });

  it("is idempotent for an unchanged status", () => {
    actions().setFollowStatus("v1", "u1", "accepted");
    actions().setFollowStatus("v1", "u1", "accepted");

    expect(followers("u1")).toBe(1);
  });

  it("isolates follow state between viewers", () => {
    actions().upsertUsers([withStatus({ ...user, followersCount: 5 }, "accepted")], "v2");
    actions().setFollowStatus("v1", "u1", "accepted");

    expect(isFollowing("v1", "u1")).toBe(true);
    expect(isFollowing("v2", "u1")).toBe(true);
    actions().setFollowStatus("v2", "u1", "none");
    expect(isFollowing("v1", "u1")).toBe(true);
    expect(isFollowing("v2", "u1")).toBe(false);
  });

  it("never drops the follower count below 0", () => {
    actions().upsertUsers([withStatus({ ...user, followersCount: 0 }, "accepted")], "v1");
    actions().setFollowStatus("v1", "u1", "none");

    expect(followers("u1")).toBe(0);
  });

  it("ignores unknown ids", () => {
    const before = useUserStore.getState();
    actions().setFollowStatus("v1", "nope", "accepted");

    expect(useUserStore.getState()).toBe(before);
  });

  it("adjusts the actor's own following count in the same update when cached", () => {
    actions().upsertUsers([{ ...user, id: "v1", username: "viewer", followingCount: 4 }], "v1");
    const listener = vi.fn();
    const unsubscribe = useUserStore.subscribe(listener);

    actions().setFollowStatus("v1", "u1", "accepted");
    unsubscribe();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(useUserStore.getState().users.v1.followingCount).toBe(5);
    expect(followers("u1")).toBe(1);

    actions().setFollowStatus("v1", "u1", "none");
    expect(useUserStore.getState().users.v1.followingCount).toBe(4);
  });

  it("applies a loaded follow set only when no local change happened meanwhile", () => {
    const version = useUserStore.getState().follows.v1.version;
    actions().setFollowStatus("v1", "u1", "accepted");

    expect(actions().setFollowedIds("v1", ["author-02"], version)).toBe(false);
    expect(getFollowedIds("v1").loaded).toBe(false);

    const current = useUserStore.getState().follows.v1.version;
    expect(actions().setFollowedIds("v1", ["author-02"], current)).toBe(true);
    expect(getFollowedIds("v1")).toEqual({ ids: new Set(["author-02"]), loaded: true });
  });

  it("keeps pending requests when the accepted follow set loads", () => {
    actions().upsertUsers([withStatus({ ...user, id: "u7" }, "pending")], "v1");
    const { version } = useUserStore.getState().follows.v1;

    actions().setFollowedIds("v1", ["author-02"], version);

    expect(statusOf("v1", "u7")).toBe("pending");
    const { result } = renderHook(() => useFollowState("u7"));
    expect(result.current).toBe("pending");
    expect(getFollowedIds("v1").ids.has("u7")).toBe(false);
  });

  it("lets an accepted entry from the loaded set win over a cached pending one", () => {
    actions().upsertUsers([withStatus({ ...user, id: "u7" }, "pending")], "v1");
    const { version } = useUserStore.getState().follows.v1;

    actions().setFollowedIds("v1", ["u7"], version);

    expect(statusOf("v1", "u7")).toBe("accepted");
  });
});

describe("clearViewerFollows", () => {
  it("drops the viewer's projection but keeps the slot and bumps its version", () => {
    actions().setFollowStatus("v1", "u1", "accepted");
    actions().setFollowedIds("v1", ["u1"], useUserStore.getState().follows.v1.version);
    const before = useUserStore.getState().follows.v1.version;

    clearViewerFollows("v1");

    const slot = useUserStore.getState().follows.v1;
    expect(slot).toMatchObject({ status: {}, known: {}, loaded: false });
    expect(slot.version).toBeGreaterThan(before);
    const { result } = renderHook(() => useFollowState("u1"));
    expect(result.current).toBeUndefined();
  });

  it("discards an in-flight follow graph load that started before the clear", async () => {
    const spy = vi.spyOn(service, "fetchFollowedIds").mockImplementation(async () => {
      if (spy.mock.calls.length === 1) {
        clearViewerFollows("v1");
        return ["stale"];
      }
      return ["fresh"];
    });

    await ensureFollowGraph("v1");

    expect(spy).toHaveBeenCalledTimes(2);
    expect(getFollowedIds("v1")).toEqual({ ids: new Set(["fresh"]), loaded: true });
  });

  it("creates a versioned slot for a viewer without one so an in-flight load from version 0 is discarded", () => {
    clearViewerFollows("nobody");

    expect(useUserStore.getState().follows.nobody.version).toBeGreaterThan(0);
    expect(actions().setFollowedIds("nobody", ["stale"], 0)).toBe(false);
  });
});

describe("useUser", () => {
  it("projects the current viewer's follow status", () => {
    actions().setFollowStatus("v1", "u1", "accepted");
    const { result } = renderHook(() => useUser("u1"));
    expect(result.current).toMatchObject({ id: "u1", isFollowing: true, followStatus: "accepted", followersCount: 1 });

    act(() => signInAs("v2"));
    expect(result.current).toMatchObject({ id: "u1", isFollowing: false, followStatus: "none", followersCount: 1 });
  });

  it("projects a pending request", () => {
    actions().setFollowStatus("v1", "u1", "pending");
    const { result } = renderHook(() => useUser("u1"));

    expect(result.current).toMatchObject({ isFollowing: false, followStatus: "pending" });
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
    await expect(ensureUser("u1", "v1")).resolves.toMatchObject({ id: "u1", isFollowing: false, followStatus: "none" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("refetches a user cached for another viewer while this viewer's follow state is unknown", async () => {
    const spy = vi.spyOn(service, "fetchUser").mockResolvedValue(withStatus(user, "accepted"));

    await expect(ensureUser("u1", "v2")).resolves.toMatchObject({ isFollowing: true });

    expect(spy).toHaveBeenCalledWith("u1", "v2");
    expect(isFollowing("v2", "u1")).toBe(true);
  });

  it("trusts the cache once the viewer's follow graph is loaded", async () => {
    const spy = vi.spyOn(service, "fetchUser");
    actions().setFollowedIds("v2", ["u1"], 0);

    await expect(ensureUser("u1", "v2")).resolves.toMatchObject({ isFollowing: true });
    expect(spy).not.toHaveBeenCalled();
  });

  it("dedupes concurrent requests and upserts the result", async () => {
    const spy = vi.spyOn(service, "fetchUser").mockResolvedValue(withStatus({ ...user, id: "u9" }, "accepted"));

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

  it("retries once when a local change raced the request", async () => {
    const spy = vi.spyOn(service, "fetchFollowedIds").mockImplementation(async () => {
      if (spy.mock.calls.length === 1) actions().setFollowStatus("v1", "u1", "accepted");
      return ["author-02", "u1"];
    });

    await ensureFollowGraph("v1");

    expect(spy).toHaveBeenCalledTimes(2);
    expect(getFollowedIds("v1").loaded).toBe(true);
  });
});

describe("useFollowState", () => {
  it("is known for the viewer that fetched the user, unknown for another viewer", () => {
    const { result } = renderHook(() => useFollowState("u1"));
    expect(result.current).toBe("none");

    act(() => signInAs("v2"));
    expect(result.current).toBeUndefined();

    act(() => actions().setFollowedIds("v2", ["u1"], 0));
    expect(result.current).toBe("accepted");
  });
});

describe("useFollowedIds", () => {
  it("returns the current viewer's accepted follow set and loaded flag", () => {
    actions().setFollowStatus("v1", "u1", "accepted");
    const { result } = renderHook(() => useFollowedIds());

    expect(result.current).toEqual({ ids: new Set(["u1"]), loaded: false });
  });

  it("excludes pending requests", () => {
    actions().setFollowStatus("v1", "u1", "pending");
    const { result } = renderHook(() => useFollowedIds());

    expect(result.current.ids.has("u1")).toBe(false);
  });
});

describe("username index & patch", () => {
  it("indexes users by lowercase username", () => {
    actions().upsertUsers([{ ...user, id: "u2", username: "AnQuoc.Dev" }], "v1");
    expect(useUserStore.getState().idByUsername["anquoc.dev"]).toBe("u2");
  });

  it("useUserByUsername resolves case-insensitively", () => {
    const { result } = renderHook(() => useUserByUsername("MinhThu"));
    expect(result.current).toMatchObject({ id: "u1", isFollowing: false, followStatus: "none" });
  });

  it("patchUser merges shared base fields everywhere", () => {
    actions().patchUser("u1", { displayName: "X", bio: "new bio" });
    const { result } = renderHook(() => useUser("u1"));
    expect(result.current).toMatchObject({ displayName: "X", bio: "new bio", username: "minhthu" });
  });
});

describe("commitFollow", () => {
  const deferred = <T>() => {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
  const refetched = (overrides: Partial<UserProfile> = {}) =>
    vi.spyOn(service, "fetchUser").mockImplementation(async (id) => ({ ...user, id, ...overrides }));

  it("follows a public user optimistically as accepted and refetches target and actor", async () => {
    const order: string[] = [];
    vi.spyOn(service, "followUser").mockImplementation(async () => {
      order.push("followUser");
      return "accepted";
    });
    const fetchSpy = vi.spyOn(service, "fetchUser").mockImplementation(async (id) => {
      order.push(`fetch:${id}`);
      return { ...withStatus(user, "accepted"), id, username: id, followersCount: 99 };
    });

    const commit = commitFollow("v1", "u1", "follow");
    expect(statusOf("v1", "u1")).toBe("accepted");
    await expect(commit).resolves.toBe(true);

    expect(order[0]).toBe("followUser");
    expect(fetchSpy.mock.calls.map(([id]) => id).sort()).toEqual(["u1", "v1"]);
    expect(followers("u1")).toBe(99);
  });

  it("follows a private user optimistically as pending without counting a follower", async () => {
    actions().upsertUsers([{ ...user, id: "u2", username: "priv", isPrivate: true }], "v1");
    vi.spyOn(service, "followUser").mockResolvedValue("pending");
    refetched({ isPrivate: true, followStatus: "pending" });

    const commit = commitFollow("v1", "u2", "follow");
    expect(statusOf("v1", "u2")).toBe("pending");
    await commit;

    expect(statusOf("v1", "u2")).toBe("pending");
    expect(followers("u2")).toBe(0);
  });

  it("BE 404 mid-session (target blocked or deleted) rolls the optimistic follow back", async () => {
    vi.spyOn(service, "followUser").mockRejectedValue(new ApiError({ kind: "http", status: 404, code: "NotFound" }));

    const commit = commitFollow("v1", "u1", "follow");
    expect(statusOf("v1", "u1")).toBe("accepted");

    await expect(commit).resolves.toBe(false);
    expect(statusOf("v1", "u1")).toBeUndefined();
  });

  it("applies the service status when it differs from the optimistic guess", async () => {
    vi.spyOn(service, "followUser").mockResolvedValue("pending");
    vi.spyOn(service, "fetchUser").mockResolvedValue(null);

    await commitFollow("v1", "u1", "follow");

    expect(statusOf("v1", "u1")).toBe("pending");
    expect(followers("u1")).toBe(0);
  });

  it("unfollows optimistically as none", async () => {
    actions().upsertUsers([withStatus({ ...user, followersCount: 5 }, "accepted")], "v1");
    vi.spyOn(service, "unfollowUser").mockResolvedValue();
    refetched({ followersCount: 4 });

    const commit = commitFollow("v1", "u1", "unfollow");
    expect(statusOf("v1", "u1")).toBeUndefined();
    expect(followers("u1")).toBe(4);
    await commit;
  });

  it("cancels a pending request on unfollow", async () => {
    actions().upsertUsers([withStatus(user, "pending")], "v1");
    const spy = vi.spyOn(service, "unfollowUser").mockResolvedValue();
    refetched();

    await expect(commitFollow("v1", "u1", "unfollow")).resolves.toBe(true);

    expect(spy).toHaveBeenCalledWith("u1", "v1");
    expect(statusOf("v1", "u1")).toBeUndefined();
  });

  it("skips the stale refetch when a newer op on the same target started (last click wins)", async () => {
    const first = deferred<FollowStatus>();
    const second = deferred<void>();
    vi.spyOn(service, "followUser").mockReturnValueOnce(first.promise);
    vi.spyOn(service, "unfollowUser").mockReturnValueOnce(second.promise);
    const fetchSpy = refetched();

    const a = commitFollow("v1", "u1", "follow");
    const b = commitFollow("v1", "u1", "unfollow");
    first.resolve("accepted");
    await a;
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(statusOf("v1", "u1")).toBeUndefined();

    second.resolve();
    await b;
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(isFollowing("v1", "u1")).toBe(false);
  });

  it("does not let ops on different targets suppress each other's reconcile", async () => {
    actions().upsertUsers([{ ...user, id: "u2", username: "other" }], "v1");
    const first = deferred<FollowStatus>();
    const second = deferred<FollowStatus>();
    vi.spyOn(service, "followUser").mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const fetchSpy = refetched();

    const a = commitFollow("v1", "u1", "follow");
    const b = commitFollow("v1", "u2", "follow");
    first.resolve("accepted");
    await a;

    expect(fetchSpy.mock.calls.map(([id]) => id)).toContain("u1");
    second.resolve("accepted");
    await b;
  });

  it("discards the refetch response when a newer op lands while the fetch is in flight", async () => {
    vi.spyOn(service, "followUser").mockResolvedValue("accepted");
    vi.spyOn(service, "unfollowUser").mockResolvedValue();
    const fetchDeferreds: ReturnType<typeof deferred<UserProfile>>[] = [];
    vi.spyOn(service, "fetchUser").mockImplementation(() => {
      const next = deferred<UserProfile>();
      fetchDeferreds.push(next);
      return next.promise;
    });

    const first = commitFollow("v1", "u1", "follow");
    // Flush microtasks so followUser resolves and the version-gated refetch starts (2 fetchUser calls: u1, v1)
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchDeferreds).toHaveLength(2);

    // A newer op (e.g. a second click) lands before the first commit's refetch resolves
    void commitFollow("v1", "u1", "unfollow");
    expect(isFollowing("v1", "u1")).toBe(false);

    // The stale refetch resolves with data from before the newer op
    fetchDeferreds[0].resolve({ ...withStatus(user, "accepted"), id: "u1", followersCount: 99 });
    fetchDeferreds[1].resolve({ ...user, id: "v1", followersCount: 0 });
    await first;

    expect(isFollowing("v1", "u1")).toBe(false);
    expect(followers("u1")).not.toBe(99);
  });

  it("reverts only its own optimistic value and resolves false when the write fails", async () => {
    vi.spyOn(service, "followUser").mockRejectedValue(new Error("boom"));

    await expect(commitFollow("v1", "u1", "follow")).resolves.toBe(false);

    expect(isFollowing("v1", "u1")).toBe(false);
    expect(followers("u1")).toBe(0);
  });

  it("does not revert a newer op's value when an older write fails", async () => {
    const first = deferred<FollowStatus>();
    vi.spyOn(service, "followUser").mockReturnValueOnce(first.promise);
    vi.spyOn(service, "unfollowUser").mockResolvedValue();
    refetched();

    const a = commitFollow("v1", "u1", "follow");
    const b = commitFollow("v1", "u1", "unfollow");
    first.reject(new Error("boom"));

    await expect(a).resolves.toBe(false);
    await b;
    expect(statusOf("v1", "u1")).toBeUndefined();
  });
});

describe("commitFollow against the mock graph", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.restoreAllMocks();
    __resetRelationGraph();
    __resetBlockGraph();
    __resetPrivacy();
    service.__resetMockUsers();
    resetUserStore();
    signInAs("1");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("ends as none with counts equal to the graph when unfollow follows follow before the first resolves", async () => {
    const loaded = ensureUser("author-07", "1");
    await vi.runAllTimersAsync();
    await loaded;

    const a = commitFollow("1", "author-07", "follow");
    const b = commitFollow("1", "author-07", "unfollow");
    await vi.runAllTimersAsync();
    await Promise.all([a, b]);

    expect(statusOf("1", "author-07")).toBeUndefined();
    expect(getFollowStatus("1", "author-07")).toBe("none");
    expect(getRequestIds("author-07")).not.toContain("1");
    expect(followers("author-07")).toBe(HIDDEN_FOLLOWERS["author-07"] + getFollowerCount("author-07"));
  });

  it("shows a pending request after following a private account", async () => {
    const loaded = ensureUser("author-07", "1");
    await vi.runAllTimersAsync();
    await loaded;

    const commit = commitFollow("1", "author-07", "follow");
    await vi.runAllTimersAsync();
    await commit;

    expect(statusOf("1", "author-07")).toBe("pending");
    expect(getFollowStatus("1", "author-07")).toBe("pending");
  });
});

describe("ensureUserByUsername", () => {
  it("returns the cached user without fetching", async () => {
    const spy = vi.spyOn(service, "fetchUserByUsername");
    await expect(ensureUserByUsername("MinhThu", "v1")).resolves.toMatchObject({ id: "u1" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("dedupes concurrent lookups and upserts the result", async () => {
    const spy = vi
      .spyOn(service, "fetchUserByUsername")
      .mockResolvedValue(withStatus({ ...user, id: "u9", username: "fresh" }, "accepted"));

    const [a, b] = await Promise.all([ensureUserByUsername("fresh", "v1"), ensureUserByUsername("Fresh", "v1")]);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    expect(useUserStore.getState().idByUsername.fresh).toBe("u9");
  });

  it("resolves null for an unknown username", async () => {
    vi.spyOn(service, "fetchUserByUsername").mockResolvedValue(null);
    await expect(ensureUserByUsername("nobody", "v1")).resolves.toBeNull();
  });
});

describe("ensureViewerUser", () => {
  const input = { id: "2", username: "new.user", displayName: "New" };
  const profile: UserProfile = { ...user, id: "2", username: "new.user", displayName: "New" };

  it("shares one promise per user id across concurrent and later callers", async () => {
    const spy = vi.spyOn(service, "upsertViewerUser").mockResolvedValue(profile);

    const [a, b] = await Promise.all([ensureViewerUser(input, "2"), ensureViewerUser(input, "2")]);
    const c = await ensureViewerUser(input, "2");

    expect(spy).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(c).toBe(a);
    expect(useUserStore.getState().idByUsername["new.user"]).toBe("2");
  });

  it("does not hand a second account (same id, other username) the first account's promise", async () => {
    const bob: UserProfile = { ...profile, username: "bob", displayName: "Bob" };
    const spy = vi.spyOn(service, "upsertViewerUser").mockResolvedValueOnce(profile).mockResolvedValueOnce(bob);

    await ensureViewerUser(input, "2");
    const second = await ensureViewerUser({ ...input, username: "bob", displayName: "Bob" }, "2");

    expect(spy).toHaveBeenCalledTimes(2);
    expect(second).toMatchObject({ username: "bob" });
    expect(useUserStore.getState().idByUsername.bob).toBe("2");
  });

  it("evicts a rejected promise so the next call retries", async () => {
    const spy = vi.spyOn(service, "upsertViewerUser").mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(profile);

    await expect(ensureViewerUser(input, "2")).rejects.toThrow("boom");
    await expect(ensureViewerUser(input, "2")).resolves.toMatchObject({ id: "2" });
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe("follow state after the follow graph loaded (pending is not in the accepted set)", () => {
  it("reports unknown, not none, for an id the viewer never fetched", () => {
    actions().setFollowedIds("v2", ["author-02"], 0);
    const { result } = renderHook(() => useFollowState("u1"));

    act(() => signInAs("v2"));

    expect(result.current).toBeUndefined();
  });

  it("refetches a user that is not known for the viewer even though the graph is loaded, restoring pending", async () => {
    actions().setFollowedIds("v2", ["author-02"], 0);
    const spy = vi.spyOn(service, "fetchUser").mockResolvedValue(withStatus(user, "pending"));

    await expect(ensureUser("u1", "v2")).resolves.toMatchObject({ followStatus: "pending" });

    expect(spy).toHaveBeenCalledWith("u1", "v2");
    expect(statusOf("v2", "u1")).toBe("pending");
  });
});


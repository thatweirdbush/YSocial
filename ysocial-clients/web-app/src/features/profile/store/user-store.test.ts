import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth/store/auth-store";
import { makeUserProfile } from "../mocks/user-fixtures";
import * as service from "../services/user-service";
import type { FollowStatus, UserProfile } from "../types";
import {
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

const actions = () => useUserStore.getState().actions;
const isFollowing = (actorId: string, id: string) => useUserStore.getState().follows[actorId]?.ids[id] === true;
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

  it("refetches a user cached for another viewer while this viewer's follow state is unknown", async () => {
    const spy = vi.spyOn(service, "fetchUser").mockResolvedValue({ ...user, isFollowing: true });

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

describe("useFollowState", () => {
  it("is known for the viewer that fetched the user, unknown for another viewer", () => {
    const { result } = renderHook(() => useFollowState("u1"));
    expect(result.current).toBe(false);

    act(() => signInAs("v2"));
    expect(result.current).toBeUndefined();

    act(() => actions().setFollowedIds("v2", ["u1"], 0));
    expect(result.current).toBe(true);
  });
});

describe("useFollowedIds", () => {
  it("returns the current viewer's follow set and loaded flag", () => {
    actions().toggleFollow("v1", "u1");
    const { result } = renderHook(() => useFollowedIds());

    expect(result.current).toEqual({ ids: new Set(["u1"]), loaded: false });
  });
});

describe("username index & patch", () => {
  it("indexes users by lowercase username", () => {
    actions().upsertUsers([{ ...user, id: "u2", username: "AnQuoc.Dev" }], "v1");
    expect(useUserStore.getState().idByUsername["anquoc.dev"]).toBe("u2");
  });

  it("useUserByUsername resolves case-insensitively", () => {
    const { result } = renderHook(() => useUserByUsername("MinhThu"));
    expect(result.current).toMatchObject({ id: "u1", isFollowing: false });
  });

  it("patchUser merges shared base fields everywhere", () => {
    actions().patchUser("u1", { displayName: "X", bio: "new bio" });
    const { result } = renderHook(() => useUser("u1"));
    expect(result.current).toMatchObject({ displayName: "X", bio: "new bio", username: "minhthu" });
  });

  it("toggleFollow also adjusts the actor's following count when the actor is cached", () => {
    actions().upsertUsers([{ ...user, id: "v1", username: "viewer", followingCount: 4 }], "v1");
    const listener = vi.fn();
    const unsubscribe = useUserStore.subscribe(listener);

    actions().toggleFollow("v1", "u1");
    unsubscribe();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(useUserStore.getState().users.v1.followingCount).toBe(5);
    expect(useUserStore.getState().users.u1.followersCount).toBe(1);

    actions().toggleFollow("v1", "u1");
    expect(useUserStore.getState().users.v1.followingCount).toBe(4);
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

  it("refetches target and actor from the service after a successful write", async () => {
    const order: string[] = [];
    vi.spyOn(service, "followUser").mockImplementation(async () => {
      order.push("followUser");
      return "accepted";
    });
    const fetchSpy = vi.spyOn(service, "fetchUser").mockImplementation(async (id) => {
      order.push(`fetch:${id}`);
      return { ...user, id, username: id, followersCount: 99, isFollowing: true };
    });

    await expect(commitFollow("v1", "u1")).resolves.toBe(true);

    expect(order[0]).toBe("followUser");
    expect(fetchSpy.mock.calls.map(([id]) => id).sort()).toEqual(["u1", "v1"]);
    expect(useUserStore.getState().users.u1.followersCount).toBe(99);
  });

  it("skips the stale refetch when a newer toggle happened (last click wins)", async () => {
    const first = deferred<FollowStatus>();
    const second = deferred<void>();
    vi.spyOn(service, "followUser").mockReturnValueOnce(first.promise);
    vi.spyOn(service, "unfollowUser").mockReturnValueOnce(second.promise);
    const fetchSpy = vi.spyOn(service, "fetchUser").mockImplementation(async (id) => ({ ...user, id, isFollowing: false }));

    const a = commitFollow("v1", "u1");
    const b = commitFollow("v1", "u1");
    first.resolve("accepted");
    await a;
    expect(fetchSpy).not.toHaveBeenCalled();

    second.resolve();
    await b;
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(isFollowing("v1", "u1")).toBe(false);
  });

  it("discards the refetch response when a newer toggle lands while the fetch is in flight", async () => {
    vi.spyOn(service, "followUser").mockResolvedValue("accepted");
    const fetchDeferreds: ReturnType<typeof deferred<UserProfile>>[] = [];
    vi.spyOn(service, "fetchUser").mockImplementation(() => {
      const next = deferred<UserProfile>();
      fetchDeferreds.push(next);
      return next.promise;
    });

    const first = commitFollow("v1", "u1");
    // Flush microtasks so followUser resolves and the version-gated refetch starts (2 fetchUser calls: u1, v1)
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchDeferreds).toHaveLength(2);

    // A newer toggle (e.g. a second click) lands before the first commit's refetch resolves
    actions().toggleFollow("v1", "u1");
    expect(isFollowing("v1", "u1")).toBe(false);

    // The stale refetch resolves with data from before the newer toggle
    fetchDeferreds[0].resolve({ ...user, id: "u1", followersCount: 99, isFollowing: true });
    fetchDeferreds[1].resolve({ ...user, id: "v1", followersCount: 0, isFollowing: false });
    await first;

    expect(isFollowing("v1", "u1")).toBe(false);
    expect(useUserStore.getState().users.u1.followersCount).not.toBe(99);
  });

  it("reverts the projection and resolves false when the write fails", async () => {
    vi.spyOn(service, "followUser").mockRejectedValue(new Error("boom"));

    await expect(commitFollow("v1", "u1")).resolves.toBe(false);

    expect(isFollowing("v1", "u1")).toBe(false);
    expect(useUserStore.getState().users.u1.followersCount).toBe(0);
  });
});

describe("ensureUserByUsername", () => {
  it("returns the cached user without fetching", async () => {
    const spy = vi.spyOn(service, "fetchUserByUsername");
    await expect(ensureUserByUsername("MinhThu", "v1")).resolves.toMatchObject({ id: "u1" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("dedupes concurrent lookups and upserts the result", async () => {
    const spy = vi.spyOn(service, "fetchUserByUsername").mockResolvedValue({ ...user, id: "u9", username: "fresh", isFollowing: true });

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

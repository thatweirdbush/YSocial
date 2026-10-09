import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth/store/auth-store";
import { resetPostStore, usePostStore } from "@/features/posts/store/post-store";
import { __resetBlockGraph, setBlocked as graphSetBlocked } from "@/mocks/block-graph";
import { __resetPrivacy, isPrivate } from "@/mocks/privacy";
import { __resetRelationGraph, getFollowStatus, getRequestIds } from "@/mocks/relation-graph";
import { makeUserProfile } from "../mocks/user-fixtures";
import * as relationService from "../services/relation-service";
import * as userService from "../services/user-service";
import type { FollowStatus, RelationSets, UserProfile } from "../types";
import { beginOp, bumpViewerGeneration, getMutationSeq, resetOpLedger } from "./op-ledger";
import {
  commitBlock,
  commitCloseFriend,
  commitMute,
  commitPrivacy,
  commitRespondRequest,
  ensureRelationSets,
  invalidateViewerProjection,
  refreshRequestCount,
  resetRelationStore,
  useFollowRequestCount,
  useIsBlocked,
  useIsBlockedBy,
  useIsMuted,
  useIsPrivateAccount,
  useRelationsLoaded,
  useRelationStore,
  useViewerMarkedCloseFriend,
} from "./relation-store";
import { commitFollow, ensureUser, resetUserStore, useFollowState, useUser, useUserStore } from "./user-store";

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const EMPTY_SETS: RelationSets = { blocked: [], blockedBy: [], muted: [], closeFriends: [], isPrivate: false, requestCount: 0 };
const signInAs = (id: string) => useAuthStore.setState({ user: { id, email: `${id}@ysocial.dev` } });
const relations = (actorId: string) => useRelationStore.getState().byViewer[actorId];
const statusOf = (actorId: string, id: string): FollowStatus | undefined => useUserStore.getState().follows[actorId]?.status[id];
const excluded = () => usePostStore.getState().excludedAuthors;
const cache = (id: string, overrides: Partial<UserProfile> = {}) =>
  makeUserProfile({ id, displayName: id, username: id, followersCount: 5, followingCount: 3, ...overrides });

function seedUsers(...users: UserProfile[]) {
  useUserStore.getState().actions.upsertUsers(users, "1");
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.restoreAllMocks();
  resetRelationStore();
  resetUserStore();
  resetPostStore();
  resetOpLedger();
  __resetRelationGraph();
  __resetBlockGraph();
  __resetPrivacy();
  userService.__resetMockUsers();
  signInAs("1");
});

afterEach(() => {
  vi.useRealTimers();
  useAuthStore.setState({ user: null });
});

describe("ensureRelationSets", () => {
  it("loads the viewer's sets and request count", async () => {
    const load = ensureRelationSets("1");
    await vi.runAllTimersAsync();
    await load;

    expect(relations("1")).toMatchObject({
      loaded: true,
      closeFriends: { "author-03": true },
      isPrivate: true,
      requestCount: 4,
      blocked: {},
    });
  });

  it("dedupes concurrent calls per viewer and skips a loaded viewer unless forced", async () => {
    const spy = vi.spyOn(relationService, "fetchRelationSets").mockResolvedValue(EMPTY_SETS);

    await Promise.all([ensureRelationSets("1"), ensureRelationSets("1")]);
    await ensureRelationSets("1");
    expect(spy).toHaveBeenCalledTimes(1);

    await ensureRelationSets("1", { force: true });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("applies muted, blocked and blocked-by authors to the post store exclusions", async () => {
    vi.spyOn(relationService, "fetchRelationSets").mockResolvedValue({
      ...EMPTY_SETS,
      blocked: ["author-01"],
      blockedBy: ["author-02"],
      muted: ["author-03", "author-01"],
    });

    await ensureRelationSets("1");

    expect(excluded()).toEqual({
      "author-01": { blocked: true, muted: true },
      "author-02": { blocked: true },
      "author-03": { muted: true },
    });
    expect(relations("1").blockedBy).toEqual({ "author-02": true });
  });

  it("discards a result that started before a mutation and loads again", async () => {
    const spy = vi.spyOn(relationService, "fetchRelationSets").mockImplementation(async () => {
      if (spy.mock.calls.length === 1) {
        beginOp("1", "author-09");
        return { ...EMPTY_SETS, blocked: ["stale"] };
      }
      return { ...EMPTY_SETS, blocked: ["fresh"] };
    });

    await ensureRelationSets("1");

    expect(spy).toHaveBeenCalledTimes(2);
    expect(relations("1").blocked).toEqual({ fresh: true });
    expect(excluded()).toEqual({ fresh: { blocked: true } });
  });

  it("never applies a response of an older viewer generation to the post store (A -> B -> A)", async () => {
    const pending = deferred<RelationSets>();
    vi.spyOn(relationService, "fetchRelationSets").mockReturnValue(pending.promise);

    const load = ensureRelationSets("1");
    bumpViewerGeneration();
    bumpViewerGeneration();
    pending.resolve({ ...EMPTY_SETS, blocked: ["author-01"] });
    await load;

    expect(excluded()).toEqual({});
  });

  it("marks a guest loaded without calling the service", async () => {
    const spy = vi.spyOn(relationService, "fetchRelationSets");

    await ensureRelationSets("me");

    expect(spy).not.toHaveBeenCalled();
    expect(relations("me")).toMatchObject({ loaded: true, requestCount: 0 });
  });
});

describe("selectors", () => {
  it("reflect the current viewer's slot", async () => {
    vi.spyOn(relationService, "fetchRelationSets").mockResolvedValue({
      ...EMPTY_SETS,
      blocked: ["b1"],
      blockedBy: ["b2"],
      muted: ["m1"],
      closeFriends: ["c1"],
      isPrivate: true,
      requestCount: 2,
    });
    const { result } = renderHook(() => ({
      loaded: useRelationsLoaded(),
      blocked: useIsBlocked("b1"),
      blockedBy: useIsBlockedBy("b2"),
      muted: useIsMuted("m1"),
      isPrivate: useIsPrivateAccount(),
      count: useFollowRequestCount(),
    }));
    expect(result.current.loaded).toBe(false);

    await act(async () => {
      await ensureRelationSets("1");
    });

    expect(result.current).toEqual({ loaded: true, blocked: true, blockedBy: true, muted: true, isPrivate: true, count: 2 });
  });

  it("composes viewerMarkedCloseFriend from the flag AND an accepted follow (dormant otherwise)", () => {
    seedUsers(cache("c1"));
    useRelationStore.getState().actions.setFlag("1", "closeFriends", "c1", true);
    const { result } = renderHook(() => useViewerMarkedCloseFriend("c1"));
    expect(result.current).toBe(false);

    act(() => useUserStore.getState().actions.setFollowStatus("1", "c1", "accepted"));
    expect(result.current).toBe(true);

    act(() => useUserStore.getState().actions.setFollowStatus("1", "c1", "none"));
    expect(result.current).toBe(false);
  });

  it("feeds the relation flags into the projected user", async () => {
    seedUsers(cache("x1"));
    const { result } = renderHook(() => useUser("x1"));
    expect(result.current).toMatchObject({ isBlocked: false, isBlockedBy: false, isMuted: false });

    act(() => {
      useRelationStore.getState().actions.setFlag("1", "blocked", "x1", true);
      useRelationStore.getState().actions.setFlag("1", "blockedBy", "x1", true);
      useRelationStore.getState().actions.setFlag("1", "muted", "x1", true);
    });

    expect(result.current).toMatchObject({ isBlocked: true, isBlockedBy: true, isMuted: true });
  });
});

describe("commitBlock", () => {
  it("blocks optimistically in all 3 stores and calls the service", async () => {
    seedUsers(cache("author-03", { followersCount: 10 }), cache("1", { followingCount: 4 }));
    useUserStore.getState().actions.setFollowStatus("1", "author-03", "accepted");
    useUserStore.getState().actions.setFollowStatus("author-03", "1", "accepted");
    const spy = vi.spyOn(relationService, "setBlocked").mockResolvedValue();
    vi.spyOn(userService, "fetchUser").mockResolvedValue(null);
    vi.spyOn(relationService, "fetchFollowRequestCount").mockResolvedValue(4);

    const commit = commitBlock("1", "author-03", true);

    expect(relations("1").blocked).toEqual({ "author-03": true });
    expect(statusOf("1", "author-03")).toBeUndefined();
    expect(statusOf("author-03", "1")).toBeUndefined();
    expect(excluded()).toEqual({ "author-03": { blocked: true } });
    await expect(commit).resolves.toBe(true);
    expect(spy).toHaveBeenCalledWith("author-03", true, "1");
  });

  it("rolls a failed block back in every store while an unrelated mute stays", async () => {
    seedUsers(cache("author-03", { followersCount: 10 }), cache("author-04"));
    useUserStore.getState().actions.setFollowStatus("1", "author-03", "accepted");
    const followersBefore = useUserStore.getState().users["author-03"].followersCount;
    const mute = deferred<void>();
    vi.spyOn(relationService, "setMuted").mockReturnValue(mute.promise);
    const block = deferred<void>();
    vi.spyOn(relationService, "setBlocked").mockReturnValue(block.promise);

    const muting = commitMute("1", "author-04", true);
    const blocking = commitBlock("1", "author-03", true);
    block.reject(new Error("boom"));

    await expect(blocking).resolves.toBe(false);
    expect(relations("1").blocked["author-03"]).toBeUndefined();
    expect(statusOf("1", "author-03")).toBe("accepted");
    expect(useUserStore.getState().users["author-03"].followersCount).toBe(followersBefore);
    expect(excluded()["author-03"]).toBeUndefined();
    expect(relations("1").muted).toEqual({ "author-04": true });
    expect(excluded()["author-04"]).toEqual({ muted: true });

    mute.resolve();
    await expect(muting).resolves.toBe(true);
  });

  it("skips the reconcile of a block when a newer op on the same target started", async () => {
    const first = deferred<void>();
    const second = deferred<void>();
    vi.spyOn(relationService, "setBlocked").mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const fetchSpy = vi.spyOn(userService, "fetchUser").mockResolvedValue(null);
    vi.spyOn(relationService, "fetchFollowRequestCount").mockResolvedValue(0);

    const blocking = commitBlock("1", "author-03", true);
    const unblocking = commitBlock("1", "author-03", false);
    first.resolve();
    await blocking;
    expect(fetchSpy).not.toHaveBeenCalled();

    second.resolve();
    await unblocking;
    expect(fetchSpy).toHaveBeenCalled();
    expect(relations("1").blocked["author-03"]).toBeUndefined();
  });

  it("keeps a follow in flight on the same target from writing accepted back over a block", async () => {
    seedUsers(cache("author-03"));
    const follow = deferred<FollowStatus>();
    vi.spyOn(userService, "followUser").mockReturnValue(follow.promise);
    vi.spyOn(relationService, "setBlocked").mockResolvedValue();
    const fetchSpy = vi.spyOn(userService, "fetchUser").mockResolvedValue(null);
    vi.spyOn(relationService, "fetchFollowRequestCount").mockResolvedValue(0);

    const following = commitFollow("1", "author-03", "follow");
    expect(statusOf("1", "author-03")).toBe("accepted");
    await commitBlock("1", "author-03", true);
    fetchSpy.mockClear();
    expect(statusOf("1", "author-03")).toBeUndefined();

    follow.resolve("accepted");
    await following;

    expect(statusOf("1", "author-03")).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("lets ops on different targets reconcile independently", async () => {
    seedUsers(cache("author-03"), cache("author-04"));
    const follow = deferred<FollowStatus>();
    vi.spyOn(userService, "followUser").mockReturnValue(follow.promise);
    vi.spyOn(relationService, "setBlocked").mockResolvedValue();
    const fetchSpy = vi.spyOn(userService, "fetchUser").mockResolvedValue(null);
    vi.spyOn(relationService, "fetchFollowRequestCount").mockResolvedValue(0);

    const following = commitFollow("1", "author-03", "follow");
    await commitBlock("1", "author-04", true);
    fetchSpy.mockClear();
    follow.resolve("accepted");
    await following;

    expect(fetchSpy.mock.calls.map(([id]) => id)).toContain("author-03");
  });

  it("keeps an author excluded after unblocking when the author also blocked the viewer", async () => {
    vi.spyOn(relationService, "fetchRelationSets").mockResolvedValue({ ...EMPTY_SETS, blocked: ["author-01"], blockedBy: ["author-01"] });
    await ensureRelationSets("1");
    vi.spyOn(relationService, "setBlocked").mockResolvedValue();
    vi.spyOn(userService, "fetchUser").mockResolvedValue(null);
    vi.spyOn(relationService, "fetchFollowRequestCount").mockResolvedValue(0);

    await commitBlock("1", "author-01", false);

    expect(relations("1").blocked["author-01"]).toBeUndefined();
    expect(excluded()["author-01"]).toEqual({ blocked: true });
  });

  it("lifts the exclusion when unblocking an author who did not block the viewer", async () => {
    vi.spyOn(relationService, "fetchRelationSets").mockResolvedValue({ ...EMPTY_SETS, blocked: ["author-01"] });
    await ensureRelationSets("1");
    vi.spyOn(relationService, "setBlocked").mockResolvedValue();
    vi.spyOn(userService, "fetchUser").mockResolvedValue(null);
    vi.spyOn(relationService, "fetchFollowRequestCount").mockResolvedValue(0);

    await commitBlock("1", "author-01", false);

    expect(excluded()["author-01"]).toBeUndefined();
  });

  it("keeps a mute after block then unblock", async () => {
    vi.spyOn(relationService, "setMuted").mockResolvedValue();
    vi.spyOn(relationService, "setBlocked").mockResolvedValue();
    vi.spyOn(userService, "fetchUser").mockResolvedValue(null);
    vi.spyOn(relationService, "fetchFollowRequestCount").mockResolvedValue(0);

    await commitMute("1", "author-02", true);
    await commitBlock("1", "author-02", true);
    await commitBlock("1", "author-02", false);

    expect(excluded()["author-02"]).toEqual({ muted: true });
  });

  it("refreshes the request count after blocking a user with a pending request", async () => {
    const loaded = ensureRelationSets("1");
    await vi.runAllTimersAsync();
    await loaded;
    expect(relations("1").requestCount).toBe(4);

    const commit = commitBlock("1", "author-02", true);
    await vi.runAllTimersAsync();
    await commit;

    expect(relations("1").requestCount).toBe(3);
    expect(getRequestIds("1")).not.toContain("author-02");
  });

  it("resolves false without calling the service for a guest", async () => {
    const spy = vi.spyOn(relationService, "setBlocked");

    await expect(commitBlock("me", "author-01", true)).resolves.toBe(false);

    expect(spy).not.toHaveBeenCalled();
    expect(relations("me")).toBeUndefined();
  });
});

describe("commitMute & commitCloseFriend", () => {
  it("mutes optimistically and excludes the author from feeds", async () => {
    const spy = vi.spyOn(relationService, "setMuted").mockResolvedValue();

    const commit = commitMute("1", "author-02", true);
    expect(relations("1").muted).toEqual({ "author-02": true });
    expect(excluded()).toEqual({ "author-02": { muted: true } });
    await expect(commit).resolves.toBe(true);
    expect(spy).toHaveBeenCalledWith("author-02", true, "1");

    await commitMute("1", "author-02", false);
    expect(relations("1").muted["author-02"]).toBeUndefined();
    expect(excluded()["author-02"]).toBeUndefined();
  });

  it("rolls a failed mute back only while the field still holds its value", async () => {
    vi.spyOn(relationService, "setMuted").mockRejectedValue(new Error("boom"));

    await expect(commitMute("1", "author-02", true)).resolves.toBe(false);

    expect(relations("1").muted["author-02"]).toBeUndefined();
    expect(excluded()["author-02"]).toBeUndefined();
  });

  it("does not roll back a newer mute change when an older write fails", async () => {
    const first = deferred<void>();
    vi.spyOn(relationService, "setMuted").mockReturnValueOnce(first.promise).mockResolvedValueOnce();

    const muting = commitMute("1", "author-02", true);
    const unmuting = commitMute("1", "author-02", false);
    first.reject(new Error("boom"));

    await expect(muting).resolves.toBe(false);
    await unmuting;
    expect(relations("1").muted["author-02"]).toBeUndefined();
  });

  it("marks a close friend optimistically and rolls back when the service rejects", async () => {
    vi.spyOn(relationService, "setCloseFriend").mockResolvedValueOnce().mockRejectedValueOnce(new Error("Close friend requires accepted follow"));

    await expect(commitCloseFriend("1", "author-02", true)).resolves.toBe(true);
    expect(relations("1").closeFriends).toEqual({ "author-02": true });

    await expect(commitCloseFriend("1", "author-02", false)).resolves.toBe(false);
    expect(relations("1").closeFriends).toEqual({ "author-02": true });
  });
});

describe("commitPrivacy", () => {
  it("going public accepts every request, zeroes the count and refetches the own user", async () => {
    const loaded = ensureRelationSets("1");
    await vi.runAllTimersAsync();
    await loaded;
    seedUsers(cache("1", { followersCount: 7, isPrivate: true }));
    const fetchSpy = vi.spyOn(userService, "fetchUser");

    const commit = commitPrivacy("1", false);
    expect(relations("1")).toMatchObject({ isPrivate: false, requestCount: 0 });
    await vi.runAllTimersAsync();

    await expect(commit).resolves.toEqual({ ok: true, acceptedCount: 4 });
    expect(isPrivate("1")).toBe(false);
    expect(fetchSpy).toHaveBeenCalledWith("1", "1");
    expect(useUserStore.getState().users["1"]).toMatchObject({ isPrivate: false });
    expect(useUserStore.getState().users["1"].followersCount).toBeGreaterThan(7);
    expect(relations("1").requestCount).toBe(0);
  });

  it("rolls the toggle and the count back when the write fails", async () => {
    const loaded = ensureRelationSets("1");
    await vi.runAllTimersAsync();
    await loaded;
    vi.spyOn(relationService, "setPrivateAccount").mockRejectedValue(new Error("boom"));

    await expect(commitPrivacy("1", false)).resolves.toEqual({ ok: false, acceptedCount: 0 });

    expect(relations("1")).toMatchObject({ isPrivate: true, requestCount: 4 });
  });

  it("returns not ok for a guest", async () => {
    await expect(commitPrivacy("me", true)).resolves.toEqual({ ok: false, acceptedCount: 0 });
  });
});

describe("commitRespondRequest", () => {
  it("accept lowers the request count and makes the requester a follower", async () => {
    const loaded = ensureRelationSets("1");
    await vi.runAllTimersAsync();
    await loaded;

    const commit = commitRespondRequest("1", "author-02", "accept");
    expect(relations("1").requestCount).toBe(3);
    await vi.runAllTimersAsync();
    await commit;

    expect(getFollowStatus("author-02", "1")).toBe("accepted");
    expect(relations("1").requestCount).toBe(3);
  });

  it("decline removes the request without a follow", async () => {
    const loaded = ensureRelationSets("1");
    await vi.runAllTimersAsync();
    await loaded;

    const commit = commitRespondRequest("1", "author-02", "decline");
    await vi.runAllTimersAsync();
    await expect(commit).resolves.toBe(true);

    expect(getFollowStatus("author-02", "1")).toBe("none");
    expect(relations("1").requestCount).toBe(3);
  });

  it("restores the count when the write fails", async () => {
    const loaded = ensureRelationSets("1");
    await vi.runAllTimersAsync();
    await loaded;
    vi.spyOn(relationService, "respondFollowRequest").mockRejectedValue(new Error("boom"));

    await expect(commitRespondRequest("1", "author-02", "accept")).resolves.toBe(false);

    expect(relations("1").requestCount).toBe(4);
  });
});

describe("refreshRequestCount", () => {
  it("applies the fetched count unless a mutation started meanwhile", async () => {
    const pending = deferred<number>();
    vi.spyOn(relationService, "fetchFollowRequestCount").mockReturnValue(pending.promise);
    useRelationStore.getState().actions.setRequestCount("1", 9);

    const refresh = refreshRequestCount("1");
    beginOp("1", "x");
    pending.resolve(2);
    await refresh;

    expect(relations("1").requestCount).toBe(9);
    expect(getMutationSeq("1")).toBeGreaterThan(0);
  });
});

describe("invalidateViewerProjection", () => {
  it("drops the viewer's follow projection and relation slot", () => {
    seedUsers(cache("author-03"));
    useUserStore.getState().actions.setFollowStatus("1", "author-03", "accepted");
    useRelationStore.getState().actions.setFlag("1", "muted", "author-03", true);

    invalidateViewerProjection("1");

    expect(useUserStore.getState().follows["1"]).toMatchObject({ status: {}, known: {}, loaded: false });
    expect(relations("1")).toBeUndefined();
  });

  it("lets a requester see Following after another account accepted while it was away", async () => {
    // Account "2" requests the private demo account "1"
    signInAs("2");
    const loadedUser = ensureUser("1", "2");
    await vi.runAllTimersAsync();
    await loadedUser;
    const requesting = commitFollow("2", "1", "follow");
    await vi.runAllTimersAsync();
    await requesting;
    expect(statusOf("2", "1")).toBe("pending");

    // Switch to "1" and accept; "2" projection stays cached meanwhile
    signInAs("1");
    const responding = commitRespondRequest("1", "2", "accept");
    await vi.runAllTimersAsync();
    await responding;
    expect(getFollowStatus("2", "1")).toBe("accepted");
    expect(statusOf("2", "1")).toBe("pending");

    // Switch back: ViewerSync invalidates the projection, the next read refetches
    signInAs("2");
    invalidateViewerProjection("2");
    const reloaded = ensureUser("1", "2");
    await vi.runAllTimersAsync();
    await reloaded;
    const { result } = renderHook(() => useFollowState("1"));

    expect(result.current).toBe("accepted");
  });
});

describe("blocked-by from the graph", () => {
  it("is visible after loading sets when another account blocked the viewer", async () => {
    graphSetBlocked("author-01", "1", true);

    const load = ensureRelationSets("1");
    await vi.runAllTimersAsync();
    await load;

    expect(relations("1").blockedBy).toEqual({ "author-01": true });
    expect(excluded()["author-01"]).toEqual({ blocked: true });
  });
});

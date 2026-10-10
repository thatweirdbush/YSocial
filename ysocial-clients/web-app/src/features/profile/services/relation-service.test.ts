import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CannotBlockYourselfError, ForbiddenError } from "@/lib/errors";
import { __resetBlockGraph, isBlocked, setBlocked as graphSetBlocked } from "@/mocks/block-graph";
import { __resetPrivacy, isPrivate } from "@/mocks/privacy";
import {
  __resetRelationGraph,
  getEdge,
  getFollowerCount,
  getFollowStatus,
  getRequestIds,
  removeFollow,
  requestFollow,
  setMutedEdge,
} from "@/mocks/relation-graph";
import { SEED_FAN_FOLLOWS } from "@/mocks/seed-fans";
import { __resetMockUsers } from "./user-service";
import {
  fetchBlockedUsers,
  fetchCloseFriendCandidates,
  fetchFollowRequestCount,
  fetchFollowRequests,
  fetchMutedUsers,
  fetchRelationSets,
  RELATION_PAGE_SIZE,
  respondFollowRequest,
  setBlocked,
  setCloseFriend,
  setMuted,
  setPrivateAccount,
} from "./relation-service";

async function settle<T>(promise: Promise<T>): Promise<T> {
  promise.catch(() => undefined);
  await vi.runAllTimersAsync();
  return promise;
}

beforeEach(() => {
  vi.useFakeTimers();
  __resetMockUsers();
  __resetRelationGraph();
  __resetBlockGraph();
  __resetPrivacy();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("guest policy", () => {
  const guestWrites: Array<[string, () => Promise<unknown>]> = [
    ["setBlocked", () => setBlocked("author-01", true, "me")],
    ["setMuted", () => setMuted("author-01", true, "me")],
    ["setCloseFriend", () => setCloseFriend("author-02", true, "me")],
    ["setPrivateAccount", () => setPrivateAccount(true, "me")],
    ["respondFollowRequest", () => respondFollowRequest("author-02", "accept", "me")],
  ];

  it.each(guestWrites)("%s rejects a guest with ForbiddenError", async (_name, call) => {
    await expect(settle(call())).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("returns empty reads for a guest", async () => {
    expect(await settle(fetchFollowRequestCount("me"))).toBe(0);
    expect(await settle(fetchFollowRequests({}, "me"))).toEqual({ users: [] });
    expect(await settle(fetchRelationSets("me"))).toEqual({
      blocked: [],
      blockedBy: [],
      muted: [],
      closeFriends: [],
      isPrivate: false,
      requestCount: 0,
    });
  });
});

describe("setBlocked", () => {
  it("blocks and unblocks through the graph", async () => {
    await settle(setBlocked("author-01", true, "1"));
    expect(isBlocked("1", "author-01")).toBe(true);

    await settle(setBlocked("author-01", false, "1"));
    expect(isBlocked("1", "author-01")).toBe(false);
  });

  it("rejects a self-block with CannotBlockYourselfError", async () => {
    await expect(settle(setBlocked("1", true, "1"))).rejects.toBeInstanceOf(CannotBlockYourselfError);
  });

  it("applies the write before the latency elapses", () => {
    void setBlocked("author-01", true, "1");

    expect(isBlocked("1", "author-01")).toBe(true);
  });
});

describe("setMuted", () => {
  it("creates a none edge when the target is not followed", async () => {
    await settle(setMuted("author-04", true, "1"));

    expect(getEdge("1", "author-04")).toEqual({ status: "none", isCloseFriend: false, isMuted: true });
    await settle(setMuted("author-04", false, "1"));
    expect(getEdge("1", "author-04").isMuted).toBe(false);
  });
});

describe("setCloseFriend", () => {
  it("marks an accepted follow", async () => {
    await settle(setCloseFriend("author-02", true, "1"));

    expect(getEdge("1", "author-02").isCloseFriend).toBe(true);
  });

  it("rejects a target that is not an accepted follow", async () => {
    await expect(settle(setCloseFriend("author-07", true, "1"))).rejects.toThrow("Close friend requires accepted follow");
  });
});

describe("privacy & requests", () => {
  it("reports the seeded relation sets of the demo account", async () => {
    expect(await settle(fetchRelationSets("1"))).toEqual({
      blocked: [],
      blockedBy: [],
      muted: [],
      closeFriends: ["author-03"],
      isPrivate: true,
      requestCount: 4,
    });
  });

  it("keeps a dormant close friend flag in the sets so a re-follow reactivates it client side", async () => {
    removeFollow("1", "author-03");

    expect((await settle(fetchRelationSets("1"))).closeFriends).toEqual(["author-03"]);
    expect((await settle(fetchCloseFriendCandidates({}, "1"))).users.map((user) => user.id)).not.toContain("author-03");
  });

  it("reports who blocked the viewer", async () => {
    graphSetBlocked("author-01", "1", true);

    expect((await settle(fetchRelationSets("1"))).blockedBy).toEqual(["author-01"]);
  });

  it("accepts a request", async () => {
    await settle(respondFollowRequest("author-02", "accept", "1"));

    expect(getFollowStatus("author-02", "1")).toBe("accepted");
    expect(await settle(fetchFollowRequestCount("1"))).toBe(3);
  });

  it("declines a request without a follow", async () => {
    const followers = getFollowerCount("1");

    await settle(respondFollowRequest("author-02", "decline", "1"));

    expect(getFollowStatus("author-02", "1")).toBe("none");
    expect(getFollowerCount("1")).toBe(followers);
    expect(await settle(fetchFollowRequestCount("1"))).toBe(3);
  });

  it("rejects responding to a user without a pending request", async () => {
    await expect(settle(respondFollowRequest("author-04", "accept", "1"))).rejects.toThrow();
  });

  it("accepts every pending request when going public", async () => {
    expect(await settle(setPrivateAccount(false, "1"))).toEqual({ acceptedCount: 4 });
    expect(isPrivate("1")).toBe(false);
    expect(getRequestIds("1")).toEqual([]);
  });

  it("filters requests by query", async () => {
    const page = await settle(fetchFollowRequests({ query: "elena" }, "1"));

    expect(page.users.map((user) => user.id)).toEqual(["author-02"]);
    expect(page.users[0]).toMatchObject({ username: "elena_v", followStatus: "accepted" });
  });

  it("pages requests 20 at a time, newest first", async () => {
    const fans = SEED_FAN_FOLLOWS["author-02"].slice(0, 25);
    for (const fan of fans) requestFollow(fan, "1", true);

    const first = await settle(fetchFollowRequests({}, "1"));
    expect(first.users).toHaveLength(RELATION_PAGE_SIZE);
    expect(first.users[0].id).toBe(fans[24]);
    expect(first.nextPage).toBe(2);

    const second = await settle(fetchFollowRequests({ page: 2 }, "1"));
    expect(second.users.length).toBe(4 + 25 - RELATION_PAGE_SIZE);
    expect(second.nextPage).toBeUndefined();
  });
});

describe("lists", () => {
  it("lists blocked and muted users", async () => {
    graphSetBlocked("1", "author-01", true);
    setMutedEdge("1", "author-04", true);

    expect((await settle(fetchBlockedUsers({}, "1"))).users.map((user) => user.id)).toEqual(["author-01"]);
    expect((await settle(fetchMutedUsers({}, "1"))).users.map((user) => user.id)).toEqual(["author-04"]);
  });

  it("lists accepted followees as close friend candidates with the flag projected", async () => {
    const page = await settle(fetchCloseFriendCandidates({}, "1"));

    expect(page.users.map((user) => user.id).sort()).toEqual(["author-02", "author-03", "author-06"]);
    expect(page.users.find((user) => user.id === "author-03")?.viewerMarkedCloseFriend).toBe(true);
    expect(page.users.find((user) => user.id === "author-02")?.viewerMarkedCloseFriend).toBe(false);
  });

  it("filters a list by query", async () => {
    const page = await settle(fetchCloseFriendCandidates({ query: "quoc" }, "1"));

    expect(page.users.map((user) => user.id)).toEqual(["author-03"]);
  });
});

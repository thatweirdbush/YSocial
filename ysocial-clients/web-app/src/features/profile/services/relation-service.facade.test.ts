import { afterEach, describe, expect, it, vi } from "vitest";
import * as blockGraph from "@/mocks/block-graph";
import * as relationGraph from "@/mocks/relation-graph";
import { setRealSlices } from "@/test/api-test-utils";
import {
  fetchBlockedUsers,
  fetchCloseFriendCandidates,
  fetchFollowRequestCount,
  fetchFollowRequests,
  fetchMutedUsers,
  fetchRelationSets,
  setBlocked,
  setMuted,
} from "./relation-service";

const REAL_VIEWER = "0b8f1c52-6a3e-4c53-9b42-5f9d6f7a1e10";
const EMPTY_PAGE = { users: [] };

afterEach(() => vi.restoreAllMocks());

describe("relation facade (content real, graph mock)", () => {
  it("every read answers empty defaults without touching the mock graph", async () => {
    setRealSlices("auth,content");
    const graphReads = [
      vi.spyOn(blockGraph, "getBlockedIds"),
      vi.spyOn(blockGraph, "getBlockerIds"),
      vi.spyOn(relationGraph, "getRequestIds"),
      vi.spyOn(relationGraph, "getMutedIds"),
      vi.spyOn(relationGraph, "getFollowedIds"),
      vi.spyOn(relationGraph, "getCloseFriendFlagIds"),
    ];

    expect(await fetchRelationSets(REAL_VIEWER)).toEqual({
      blocked: [],
      blockedBy: [],
      muted: [],
      closeFriends: [],
      isPrivate: false,
      requestCount: 0,
    });
    expect(await fetchFollowRequests({}, REAL_VIEWER)).toEqual(EMPTY_PAGE);
    expect(await fetchFollowRequestCount(REAL_VIEWER)).toBe(0);
    expect(await fetchBlockedUsers({}, REAL_VIEWER)).toEqual(EMPTY_PAGE);
    expect(await fetchMutedUsers({}, REAL_VIEWER)).toEqual(EMPTY_PAGE);
    expect(await fetchCloseFriendCandidates({}, REAL_VIEWER)).toEqual(EMPTY_PAGE);
    for (const spy of graphReads) expect(spy).not.toHaveBeenCalled();
  });

  it("writes are refused instead of writing a real id into the mock graph", async () => {
    setRealSlices("auth,content");
    const write = vi.spyOn(blockGraph, "setBlocked");
    await expect(setBlocked("22222222-2222-4222-8222-222222222222", true, REAL_VIEWER)).rejects.toThrow();
    await expect(setMuted("22222222-2222-4222-8222-222222222222", true, REAL_VIEWER)).rejects.toThrow();
    expect(write).not.toHaveBeenCalled();
  });

  it("mock mode keeps the mock graph", async () => {
    setRealSlices("auth");
    const sets = await fetchRelationSets("author-01");
    expect(sets.blocked).toEqual(expect.any(Array));
  });
});

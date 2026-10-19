import { afterEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth/store/auth-store";
import * as blockGraph from "@/mocks/block-graph";
import * as relationGraph from "@/mocks/relation-graph";
import { API_BASE_URL } from "@/lib/api-config";
import { mockFetchSequence, setRealSlices } from "@/test/api-test-utils";
import { fetchFollowList } from "./user-service";
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

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

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

describe("graph real", () => {
  const OTHER = "22222222-2222-4222-8222-222222222222";

  it("reads & writes reach the BE, never the mock graph", async () => {
    setRealSlices("auth,content,graph");
    useAuthStore.getState().actions.setTokens("A1", "R1");
    const fake = mockFetchSequence([
      { status: 200, body: { blocked: [OTHER], isPrivate: true, requestCount: 1 } },
      { status: 204 },
      { status: 200, body: { items: [], page: 1, pageSize: 20, hasNextPage: false, locked: true } },
    ]);
    vi.stubGlobal("fetch", fake.fetchFn);
    const graphWrite = vi.spyOn(blockGraph, "setBlocked");

    expect(await fetchRelationSets(REAL_VIEWER)).toMatchObject({ blocked: [OTHER], isPrivate: true, requestCount: 1 });
    await setBlocked(OTHER, true, REAL_VIEWER);
    expect(await fetchFollowList(OTHER, "followers", {}, REAL_VIEWER)).toMatchObject({ locked: true });
    expect(fake.calls.map((call) => call.url.replace(API_BASE_URL, ""))).toEqual([
      "/api/users/me/relation-sets",
      `/api/users/${OTHER}/blocks`,
      `/api/users/${OTHER}/followers?page=1&pageSize=20`,
    ]);
    expect(graphWrite).not.toHaveBeenCalled();
  });

  it("mute reaches the BE once activity is real", async () => {
    setRealSlices("auth,content,graph,activity");
    useAuthStore.getState().actions.setTokens("A1", "R1");
    const fake = mockFetchSequence([{ status: 204 }]);
    vi.stubGlobal("fetch", fake.fetchFn);
    const graphWrite = vi.spyOn(relationGraph, "setMutedEdge");

    await setMuted(OTHER, true, REAL_VIEWER);
    expect(fake.calls[0].url.replace(API_BASE_URL, "")).toBe(`/api/users/${OTHER}/relations/mute`);
    expect(graphWrite).not.toHaveBeenCalled();
  });

  it("mute stays a facade until the activity slice", async () => {
    setRealSlices("auth,content,graph");
    expect(await fetchMutedUsers({}, REAL_VIEWER)).toEqual(EMPTY_PAGE);
    await expect(setMuted(OTHER, true, REAL_VIEWER)).rejects.toThrow();
  });
});

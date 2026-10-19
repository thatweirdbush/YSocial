import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth/store/auth-store";
import { API_BASE_URL } from "@/lib/api-config";
import { mockFetchSequence, problem, type MockStep } from "@/test/api-test-utils";
import {
  fetchBlockedUsers,
  fetchCloseFriendCandidates,
  fetchFollowList,
  fetchFollowRequestCount,
  fetchFollowRequests,
  fetchRelationSets,
  respondFollowRequest,
  setBlocked,
  setCloseFriend,
  setPrivateAccount,
} from "./relation-service.real";

const ME = "0b8f1c52-6a3e-4c53-9b42-5f9d6f7a1e10";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const profile = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  username: `u-${id.slice(0, 2)}`,
  displayName: `User ${id.slice(0, 2)}`,
  followStatus: "none",
  isBlocked: false,
  ...overrides,
});

const page = (items: unknown[], extra: Record<string, unknown> = {}): MockStep => ({
  status: 200,
  body: { items, page: 1, pageSize: 20, totalCount: items.length, hasNextPage: false, locked: false, ...extra },
});

function useFetch(steps: MockStep[]) {
  const fake = mockFetchSequence(steps);
  vi.stubGlobal("fetch", fake.fetchFn);
  return fake.calls;
}
const path = (call: { url: string }) => call.url.replace(API_BASE_URL, "");

beforeEach(() => {
  localStorage.clear();
  useAuthStore.getState().actions.clearAuth();
  useAuthStore.getState().actions.setTokens("A1", "R1");
});
afterEach(() => vi.unstubAllGlobals());

describe("fetchFollowList", () => {
  it("maps page & sends query, page and page size", async () => {
    const calls = useFetch([page([profile(A)], { hasNextPage: true })]);
    const result = await fetchFollowList(A, "followers", { query: "li", page: 2 }, ME);
    expect(path(calls[0])).toBe(`/api/users/${A}/followers?page=2&pageSize=20&query=li`);
    expect(result.users).toHaveLength(1);
    expect(result.nextPage).toBe(2);
  });

  it("following kind uses the following route", async () => {
    const calls = useFetch([page([])]);
    await fetchFollowList(A, "following", {}, ME);
    expect(path(calls[0])).toBe(`/api/users/${A}/following?page=1&pageSize=20`);
  });

  it("private non-permitted -> locked true, items empty (not an error)", async () => {
    useFetch([page([], { locked: true })]);
    expect(await fetchFollowList(A, "followers", {}, ME)).toMatchObject({ users: [], locked: true });
  });

  it("404 (blocked either way) -> ApiError status 404", async () => {
    useFetch([problem(404, "NotFound")]);
    await expect(fetchFollowList(A, "followers", {}, ME)).rejects.toMatchObject({ status: 404 });
  });

  it("non-GUID id rejects locally without fetch", async () => {
    const calls = useFetch([]);
    await expect(fetchFollowList("author-01", "followers", {}, ME)).rejects.toMatchObject({ status: 404 });
    expect(calls).toHaveLength(0);
  });
});

describe("follow requests", () => {
  it("lists pending requests with query & paging", async () => {
    const calls = useFetch([page([profile(A, { followStatus: "none" })])]);
    const result = await fetchFollowRequests({ query: "a", page: 1 }, ME);
    expect(path(calls[0])).toBe("/api/users/me/follow-requests?page=1&pageSize=20&query=a");
    expect(result.users.map((user) => user.id)).toEqual([A]);
  });

  it("count endpoint", async () => {
    const calls = useFetch([{ status: 200, body: { count: 4 } }, { status: 200, body: {} }]);
    expect(await fetchFollowRequestCount(ME)).toBe(4);
    expect(path(calls[0])).toBe("/api/users/me/follow-requests/count");
    expect(await fetchFollowRequestCount(ME)).toBe(0);
  });
});

describe("fetchBlockedUsers", () => {
  it("marks items isBlocked & pages without a query", async () => {
    const calls = useFetch([page([profile(A)], { hasNextPage: true })]);
    const result = await fetchBlockedUsers({ page: 1 }, ME);
    expect(path(calls[0])).toBe("/api/users/me/blocks?page=1&pageSize=20");
    expect(result.users[0].isBlocked).toBe(true);
    expect(result.nextPage).toBe(2);
  });

  it("query: BE has no search, so every block page is read & filtered locally (diacritics-insensitive)", async () => {
    const calls = useFetch([
      page([profile(A, { displayName: "Nguyễn Văn A", username: "vana" })], { hasNextPage: true, pageSize: 50 }),
      page([profile(B, { displayName: "Lê B", username: "leb" })], { page: 2, pageSize: 50 }),
    ]);
    const result = await fetchBlockedUsers({ query: "nguyen" }, ME);
    expect(calls.map(path)).toEqual(["/api/users/me/blocks?page=1&pageSize=50", "/api/users/me/blocks?page=2&pageSize=50"]);
    expect(result.users.map((user) => user.id)).toEqual([A]);
    expect(result.nextPage).toBeUndefined();
  });
});

describe("fetchRelationSets", () => {
  it("maps arrays & isPrivate; blockedBy is always empty (D14)", async () => {
    const calls = useFetch([{ status: 200, body: { blocked: [A], muted: null, closeFriends: [B], isPrivate: true, requestCount: 2 } }]);
    expect(await fetchRelationSets(ME)).toEqual({
      blocked: [A],
      blockedBy: [],
      muted: [],
      closeFriends: [B],
      isPrivate: true,
      requestCount: 2,
    });
    expect(path(calls[0])).toBe("/api/users/me/relation-sets");
  });
});

describe("fetchCloseFriendCandidates", () => {
  it("accepted followees with the close friend flag projected (dormant flags stay in sets)", async () => {
    const calls = useFetch([
      page([profile(A, { followStatus: "accepted" }), profile(B, { followStatus: "accepted" })]),
      { status: 200, body: { blocked: [], muted: [], closeFriends: [B], isPrivate: false, requestCount: 0 } },
    ]);
    const result = await fetchCloseFriendCandidates({ query: "u" }, ME);
    expect(calls.map(path)).toEqual([`/api/users/${ME}/following?page=1&pageSize=20&query=u`, "/api/users/me/relation-sets"]);
    expect(result.users.map((user) => [user.id, user.viewerMarkedCloseFriend])).toEqual([
      [A, false],
      [B, true],
    ]);
  });

  it("pending followees are not candidates", async () => {
    useFetch([page([profile(A, { followStatus: "pending" })]), { status: 200, body: { closeFriends: [] } }]);
    expect((await fetchCloseFriendCandidates({}, ME)).users).toEqual([]);
  });
});

const body = (call: { init?: RequestInit }) => JSON.parse(String(call.init?.body));

describe("writes", () => {
  it("block POST then unblock DELETE (idempotent routes)", async () => {
    const calls = useFetch([{ status: 204 }, { status: 204 }]);
    await setBlocked(A, true, ME);
    await setBlocked(A, false, ME);
    expect(calls.map((call) => [call.init?.method, path(call)])).toEqual([
      ["POST", `/api/users/${A}/blocks`],
      ["DELETE", `/api/users/${A}/blocks`],
    ]);
  });

  it("block self -> CannotBlockSelf ApiError from BE", async () => {
    useFetch([problem(400, "CannotBlockSelf")]);
    await expect(setBlocked(ME, true, ME)).rejects.toMatchObject({ code: "CannotBlockSelf" });
  });

  it("block 404 (target gone) rejects for rollback", async () => {
    useFetch([problem(404, "NotFound")]);
    await expect(setBlocked(A, true, ME)).rejects.toMatchObject({ status: 404 });
  });

  it("close friend PATCH sends isCloseFriend", async () => {
    const calls = useFetch([{ status: 204 }]);
    await setCloseFriend(A, true, ME);
    expect(calls[0].init?.method).toBe("PATCH");
    expect(path(calls[0])).toBe(`/api/users/${A}/relations/close-friend`);
    expect(body(calls[0])).toEqual({ isCloseFriend: true });
  });

  it("close friend when not accepted -> CloseFriendRequiresAcceptedFollow", async () => {
    useFetch([problem(400, "CloseFriendRequiresAcceptedFollow")]);
    await expect(setCloseFriend(A, true, ME)).rejects.toMatchObject({ code: "CloseFriendRequiresAcceptedFollow" });
  });

  it("privacy PUT returns acceptedCount", async () => {
    const calls = useFetch([{ status: 200, body: { acceptedCount: 3 } }, { status: 200, body: {} }]);
    expect(await setPrivateAccount(false, ME)).toEqual({ acceptedCount: 3 });
    expect(calls[0].init?.method).toBe("PUT");
    expect(path(calls[0])).toBe("/api/users/profiles/me/privacy");
    expect(body(calls[0])).toEqual({ isPrivate: false });
    expect(await setPrivateAccount(true, ME)).toEqual({ acceptedCount: 0 });
  });

  it("respond accept / decline sends decision to the requester route", async () => {
    const calls = useFetch([{ status: 204 }, { status: 204 }]);
    await respondFollowRequest(A, "accept", ME);
    await respondFollowRequest(A, "decline", ME);
    expect(path(calls[0])).toBe(`/api/users/${A}/relations/follow-request`);
    expect(calls[0].init?.method).toBe("POST");
    expect(calls.map(body)).toEqual([{ decision: "accept" }, { decision: "decline" }]);
  });

  it("respond 404 (request gone) rejects for rollback", async () => {
    useFetch([problem(404, "NotFound")]);
    await expect(respondFollowRequest(A, "accept", ME)).rejects.toMatchObject({ status: 404 });
  });

  it("non-GUID target rejects locally without fetch", async () => {
    const calls = useFetch([]);
    await expect(setBlocked("author-01", true, ME)).rejects.toMatchObject({ status: 404 });
    await expect(setCloseFriend("author-01", true, ME)).rejects.toMatchObject({ status: 404 });
    await expect(respondFollowRequest("author-01", "accept", ME)).rejects.toMatchObject({ status: 404 });
    expect(calls).toHaveLength(0);
  });
});

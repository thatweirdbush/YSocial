import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth/store/auth-store";
import { API_BASE_URL } from "@/lib/api-config";
import { mockFetchSequence, problem, setRealSlices, type MockStep } from "@/test/api-test-utils";
import * as userService from "./user-service";
import { fetchFollowedIds, fetchUser, fetchUserByUsername, followUser, unfollowUser, updateProfile, upsertViewerUser } from "./user-service.real";

const ME = "0b8f1c52-6a3e-4c53-9b42-5f9d6f7a1e10";
const OTHER = "22222222-2222-4222-8222-222222222222";

const profile = (overrides: Record<string, unknown> = {}) => ({
  id: OTHER,
  username: "other",
  displayName: "Other",
  bio: null,
  avatarUrl: null,
  coverUrl: null,
  followersCount: 3,
  followingCount: 1,
  isPrivate: false,
  isVerified: false,
  followStatus: "none",
  isFollowing: false,
  viewerMarkedCloseFriend: false,
  isMuted: false,
  isBlocked: false,
  isBlockedBy: false,
  ...overrides,
});

function useFetch(steps: MockStep[]) {
  const fake = mockFetchSequence(steps);
  vi.stubGlobal("fetch", fake.fetchFn);
  return fake.calls;
}
const path = (call: { url: string }) => call.url.replace(API_BASE_URL, "");
const body = (call: { init?: RequestInit }) => JSON.parse(String(call.init?.body));

beforeEach(() => {
  localStorage.clear();
  useAuthStore.getState().actions.clearAuth();
  useAuthStore.getState().actions.setTokens("A1", "R1");
});
afterEach(() => vi.unstubAllGlobals());

describe("fetchUser / fetchUserByUsername", () => {
  it("maps the profile", async () => {
    const calls = useFetch([{ status: 200, body: profile({ followStatus: "pending" }) }]);
    const user = await fetchUser(OTHER, ME);
    expect(path(calls[0])).toBe(`/api/users/${OTHER}`);
    expect(user).toMatchObject({ id: OTHER, followStatus: "pending", isFollowing: false });
  });

  it("404 -> null", async () => {
    useFetch([problem(404, "NotFound")]);
    expect(await fetchUser(OTHER, ME)).toBeNull();
  });

  it("network failure & 5xx are rethrown (not null)", async () => {
    useFetch([{ status: 0, reject: new TypeError("Failed to fetch") }, problem(500, "InternalError")]);
    await expect(fetchUser(OTHER, ME)).rejects.toMatchObject({ kind: "network" });
    await expect(fetchUser(OTHER, ME)).rejects.toMatchObject({ status: 500 });
  });

  it("non-GUID id -> null without fetch", async () => {
    const calls = useFetch([]);
    expect(await fetchUser("author-01", ME)).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("fetchUserByUsername lowercases & encodes, 404 -> null", async () => {
    const calls = useFetch([{ status: 200, body: profile() }, problem(404, "NotFound")]);
    await fetchUserByUsername("Other.User", null as unknown as string);
    expect(path(calls[0])).toBe("/api/users/by-username/other.user");
    expect(await fetchUserByUsername("ghost", ME)).toBeNull();
  });
});

describe("updateProfile", () => {
  it("keeps the current cover, omits gender & birth date (BE keeps them) & maps the response", async () => {
    const calls = useFetch([
      { status: 200, body: profile({ id: ME, coverUrl: "https://x/cover.png" }) },
      { status: 200, body: profile({ id: ME, displayName: "New name", bio: "hi" }) },
    ]);
    const updated = await updateProfile(ME, { displayName: " New name ", bio: " hi " }, ME);
    expect(path(calls[1])).toBe("/api/users/profiles/me");
    expect(calls[1].init?.method).toBe("PUT");
    expect(body(calls[1])).toMatchObject({ displayName: "New name", bio: "hi", coverUrl: "https://x/cover.png" });
    expect(body(calls[1])).not.toHaveProperty("gender");
    expect(body(calls[1])).not.toHaveProperty("dateOfBirth");
    expect(updated).toMatchObject({ displayName: "New name", bio: "hi" });
  });

  it("ProfileFieldInvalid surfaces ApiError", async () => {
    useFetch([{ status: 200, body: profile({ id: ME }) }, problem(400, "ProfileFieldInvalid")]);
    await expect(updateProfile(ME, { displayName: "Name" }, ME)).rejects.toMatchObject({ code: "ProfileFieldInvalid" });
  });

  it("not own profile -> ForbiddenError without fetch", async () => {
    const calls = useFetch([]);
    await expect(updateProfile(OTHER, { displayName: "Name" }, ME)).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});

describe("follow", () => {
  it("followUser returns pending/accepted", async () => {
    const calls = useFetch([{ status: 200, body: { followStatus: "pending" } }, { status: 200, body: { followStatus: "accepted" } }]);
    expect(await followUser(OTHER, ME)).toBe("pending");
    expect(await followUser(OTHER, ME)).toBe("accepted");
    expect(path(calls[0])).toBe(`/api/users/${OTHER}/relations/follow`);
    expect(calls[0].init?.method).toBe("POST");
  });

  it("unfollow 204", async () => {
    const calls = useFetch([{ status: 204 }]);
    await expect(unfollowUser(OTHER, ME)).resolves.toBeUndefined();
    expect(calls[0].init?.method).toBe("DELETE");
  });

  it("follow 404 (blocked) rejects ApiError for rollback", async () => {
    useFetch([problem(404, "NotFound")]);
    await expect(followUser(OTHER, ME)).rejects.toMatchObject({ status: 404 });
  });

  it("non-GUID target rejects locally without fetch", async () => {
    const calls = useFetch([]);
    await expect(followUser("author-01", ME)).rejects.toMatchObject({ status: 404 });
    expect(calls).toHaveLength(0);
  });
});

describe("fetchFollowedIds", () => {
  const page = (ids: string[], pageNo: number, hasNextPage: boolean): MockStep => ({
    status: 200,
    body: { items: ids.map((id) => profile({ id })), page: pageNo, pageSize: 50, totalCount: 3, hasNextPage, locked: false },
  });

  it("pages 3 pages into 1 list", async () => {
    const calls = useFetch([page(["a1"], 1, true), page(["a2"], 2, true), page(["a3"], 3, false)]);
    const ids = await fetchFollowedIds(ME);
    expect(ids).toEqual(["a1", "a2", "a3"]);
    expect(path(calls[0])).toBe(`/api/users/${ME}/following?page=1&pageSize=50`);
    expect(path(calls[2])).toBe(`/api/users/${ME}/following?page=3&pageSize=50`);
  });

  it("pending entries are not follows", async () => {
    useFetch([
      {
        status: 200,
        body: {
          items: [profile({ id: "k1", followStatus: "accepted" }), profile({ id: "k2", followStatus: "pending" })],
          page: 1,
          pageSize: 50,
          totalCount: 2,
          hasNextPage: false,
          locked: false,
        },
      },
    ]);
    expect(await fetchFollowedIds(ME)).toEqual(["k1"]);
  });

  it("page 2 failure rethrows & never resolves partial", async () => {
    useFetch([page(["a1"], 1, true), problem(500, "InternalError")]);
    await expect(fetchFollowedIds(ME)).rejects.toMatchObject({ status: 500 });
  });

  it("guest / non-GUID actor -> empty without fetch", async () => {
    const calls = useFetch([]);
    expect(await fetchFollowedIds("me")).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});

describe("upsertViewerUser", () => {
  it("leaves the mock DB untouched and reads the real profile", async () => {
    const calls = useFetch([{ status: 200, body: profile({ id: ME, username: "me" }) }]);
    const user = await upsertViewerUser({ id: ME, username: "me", displayName: "Me" }, ME);
    expect(user.id).toBe(ME);
    expect(path(calls[0])).toBe(`/api/users/${ME}`);
  });
});

describe("dispatch", () => {
  it("user-service uses the real adapter only when content is real", async () => {
    const calls = useFetch([{ status: 200, body: profile() }]);
    setRealSlices("auth,content");
    await userService.fetchUser(OTHER, ME);
    expect(calls).toHaveLength(1);

    setRealSlices("auth");
    const mock = await userService.fetchUser("author-01", "me");
    expect(mock?.id).toBe("author-01");
    expect(calls).toHaveLength(1);
  });
});

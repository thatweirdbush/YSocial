import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth/store/auth-store";
import { API_BASE_URL } from "@/lib/api-config";
import { mockFetchSequence, setRealSlices, type MockStep } from "@/test/api-test-utils";
import * as userService from "./user-service";
import { fetchSuggestedUsers } from "./user-service.real";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const dto = (id: string, username: string) => ({
  id,
  username,
  displayName: username,
  followersCount: 3,
  followingCount: 1,
  isPrivate: false,
  isVerified: false,
  followStatus: "none",
});

function useFetch(steps: MockStep[]) {
  const fake = mockFetchSequence(steps);
  vi.stubGlobal("fetch", fake.fetchFn);
  return fake.calls;
}

beforeEach(() => {
  localStorage.clear();
  useAuthStore.getState().actions.clearAuth();
});
afterEach(() => {
  vi.unstubAllGlobals();
  setRealSlices(undefined);
});

describe("suggested users", () => {
  it("asks the BE for `limit` users and maps profiles; the viewer comes from the JWT, not a parameter", async () => {
    const calls = useFetch([{ status: 200, body: { items: [dto(A, "a"), dto(B, "b")], page: 1, pageSize: 3, totalCount: 2, hasNextPage: false } }]);

    const users = await fetchSuggestedUsers(3, "viewer-id-never-sent");

    expect(calls[0].url.replace(API_BASE_URL, "")).toBe("/api/users/suggestions?page=1&pageSize=3");
    expect(users.map((u) => u.username)).toEqual(["a", "b"]);
    expect(users[0].followStatus).toBe("none");
  });

  it("an empty page is an empty list", async () => {
    useFetch([{ status: 200, body: { items: [], page: 1, pageSize: 3, totalCount: 0, hasNextPage: false } }]);

    expect(await fetchSuggestedUsers(3, "x")).toEqual([]);
  });

  it("facade uses the BE when the content slice is real", async () => {
    setRealSlices("auth,content,graph,activity");
    const calls = useFetch([{ status: 200, body: { items: [dto(A, "a")], page: 1, pageSize: 3, totalCount: 1, hasNextPage: false } }]);

    expect((await userService.fetchSuggestedUsers(3, "x")).map((u) => u.id)).toEqual([A]);
    expect(calls).toHaveLength(1);
  });
});

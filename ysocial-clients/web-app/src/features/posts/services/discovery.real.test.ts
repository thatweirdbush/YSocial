import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth/store/auth-store";
import { API_BASE_URL } from "@/lib/api-config";
import { mockFetchSequence, problem, setRealSlices, type MockStep } from "@/test/api-test-utils";
import * as postService from "./post-service";
import { fetchPostsByTag, fetchTrendingTags } from "./post-service.real";

const ID = "11111111-1111-4111-8111-111111111111";
const ME = "0b8f1c52-6a3e-4c53-9b42-5f9d6f7a1e10";

const postDto = (id: string) => ({
  id,
  kind: "post",
  postId: id,
  content: "Chuyen di #DaLat",
  createdAt: "2026-10-19T00:00:00Z",
  isEdited: false,
  likesCount: 2,
  commentsCount: 0,
  isLikedByCurrentUser: false,
  isBookmarkedByCurrentUser: false,
  user: { id: ME, username: "me", displayName: "Me", avatarUrl: null, isVerified: false },
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
});
afterEach(() => vi.unstubAllGlobals());

describe("trending tags", () => {
  it("calls /api/trending/tags with the limit and maps tag & count", async () => {
    const calls = useFetch([{ status: 200, body: [{ tag: "SaiGon", postsCount: 4 }, { tag: "cafe", postsCount: 2 }] }]);

    expect(await fetchTrendingTags(3)).toEqual([
      { tag: "SaiGon", postsCount: 4 },
      { tag: "cafe", postsCount: 2 },
    ]);
    expect(path(calls[0])).toBe("/api/trending/tags?limit=3");
  });

  it("drops entries without a tag and defaults a missing count", async () => {
    useFetch([{ status: 200, body: [{ postsCount: 9 }, { tag: "ok" }, { tag: "" , postsCount: 1 }] }]);

    expect(await fetchTrendingTags(5)).toEqual([{ tag: "ok", postsCount: 0 }]);
  });

  it("answers an empty list for a null body", async () => {
    useFetch([{ status: 204 }]);

    expect(await fetchTrendingTags(5)).toEqual([]);
  });
});

describe("posts by tag", () => {
  it("encodes the tag, sends sort & page size and maps totalCount to postsCount", async () => {
    const calls = useFetch([{ status: 200, body: { items: [postDto(ID)], page: 1, pageSize: 50, totalCount: 7, hasNextPage: false, tag: "ĐàLạt" } }]);

    const page = await fetchPostsByTag("ĐàLạt", "top", ME);

    expect(path(calls[0])).toBe(`/api/tags/${encodeURIComponent("ĐàLạt")}/posts?sort=top&page=1&pageSize=50`);
    expect(page.tag).toBe("ĐàLạt");
    expect(page.postsCount).toBe(7);
    expect(page.posts.map((p) => p.id)).toEqual([ID]);
  });

  it("falls back to the requested tag when the BE echoes none", async () => {
    useFetch([{ status: 200, body: { items: [], page: 1, pageSize: 50, totalCount: 0, hasNextPage: false } }]);

    expect(await fetchPostsByTag("empty", "latest", ME)).toEqual({ tag: "empty", postsCount: 0, posts: [] });
  });

  it("an invalid tag (400) is an empty page, any other failure is rethrown", async () => {
    useFetch([problem(400, "ValidationFailed"), problem(500, "InternalError")]);

    expect(await fetchPostsByTag("a-b", "latest", ME)).toEqual({ tag: "a-b", postsCount: 0, posts: [] });
    await expect(fetchPostsByTag("x", "latest", ME)).rejects.toMatchObject({ status: 500 });
  });
});

describe("facade dispatch", () => {
  afterEach(() => setRealSlices(undefined));

  it("real content slice calls the BE, mock mode keeps the mock", async () => {
    setRealSlices("auth,content,graph,activity");
    const calls = useFetch([{ status: 200, body: [{ tag: "real", postsCount: 1 }] }]);
    expect((await postService.fetchTrendingTags(1))[0].tag).toBe("real");
    expect(calls).toHaveLength(1);

    setRealSlices("none");
    const mockCalls = useFetch([]);
    await postService.fetchTrendingTags(1);
    expect(mockCalls).toHaveLength(0);
  });
});

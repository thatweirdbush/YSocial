import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SEED_AUTHORS, SEED_FOLLOWED_AUTHOR_IDS } from "@/mocks/seed-authors";
import type { CreatePostInput } from "../types";
import {
  __resetMockDb,
  createPost,
  createReply,
  fetchFeed,
  fetchPostsByTag,
  fetchPostThread,
  fetchTrendingTags,
  FEED_PAGE_SIZE,
  SEARCH_LIMIT,
  searchPosts,
  setPostBookmark,
  setPostLike,
} from "./post-service";

/** Runs a service call to completion under fake timers. */
async function settle<T>(promise: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return promise;
}

const author = SEED_AUTHORS[4];
const input = (content: string): CreatePostInput => ({ content, images: [], audience: "anyone" });

beforeEach(() => {
  vi.useFakeTimers();
  __resetMockDb();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("fetchFeed", () => {
  it("returns the first page of root posts, newest first", async () => {
    const page = await settle(fetchFeed("forYou", 1));

    expect(page.posts).toHaveLength(FEED_PAGE_SIZE);
    expect(page.posts.every((p) => p.parentId === undefined)).toBe(true);
    const times = page.posts.map((p) => Date.parse(p.createdAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(page.nextPage).toBe(2);
  });

  it("ends pagination on the last page", async () => {
    const page = await settle(fetchFeed("forYou", 2));

    expect(page.posts).toHaveLength(2);
    expect(page.nextPage).toBeUndefined();
  });

  it("limits the following tab to followed authors", async () => {
    const page = await settle(fetchFeed("following", 1));

    expect(page.posts.length).toBeGreaterThan(0);
    expect(page.posts.every((p) => SEED_FOLLOWED_AUTHOR_IDS.includes(p.user.id))).toBe(true);
  });
});

describe("fetchPostThread", () => {
  it("returns direct replies newest first with their children", async () => {
    const thread = await settle(fetchPostThread("post-001"));

    expect(thread?.post.id).toBe("post-001");
    expect(thread?.parent).toBeUndefined();
    expect(thread?.replies.every((r) => r.parentId === "post-001")).toBe(true);
    const times = thread!.replies.map((r) => Date.parse(r.createdAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(thread?.childReplies["reply-001-02"]).toHaveLength(3);
    expect(thread?.childReplies["reply-001-01"]).toEqual([]);
  });

  it("includes the parent for a reply thread", async () => {
    const thread = await settle(fetchPostThread("reply-001-02"));

    expect(thread?.parent?.id).toBe("post-001");
  });

  it("returns null for an unknown id", async () => {
    expect(await settle(fetchPostThread("khong-ton-tai"))).toBeNull();
  });
});

describe("mutations", () => {
  it("rejects a reply to an unknown parent", async () => {
    const pending = createReply("nope", input("hi"), author);
    const assertion = expect(pending).rejects.toThrow(Error);
    await vi.runAllTimersAsync();
    await assertion;
  });

  it("persists a created reply and bumps the parent counter", async () => {
    const before = await settle(fetchPostThread("post-001"));
    await settle(createReply("post-001", input("hi"), author));
    const after = await settle(fetchPostThread("post-001"));

    expect(after?.replies[0].content).toBe("hi");
    expect(after?.replies[0].user).toEqual(author);
    expect(after?.post.commentsCount).toBe(before!.post.commentsCount + 1);
  });

  it("puts a created post first in the feed", async () => {
    const created = await settle(createPost(input("bài mới"), author));
    const page = await settle(fetchFeed("forYou", 1));

    expect(page.posts[0].id).toBe(created.id);
  });

  it("persists likes so a refetch keeps them (idempotent set)", async () => {
    const before = await settle(fetchPostThread("post-001"));

    await settle(setPostLike("post-001", true));
    await settle(setPostLike("post-001", true));
    const liked = await settle(fetchFeed("forYou", 1));
    const post = liked.posts.find((p) => p.id === "post-001")!;

    expect(post.isLikedByCurrentUser).toBe(true);
    expect(post.likesCount).toBe(before!.post.likesCount + 1);

    await settle(setPostLike("post-001", false));
    const unliked = await settle(fetchPostThread("post-001"));
    expect(unliked?.post.likesCount).toBe(before!.post.likesCount);
  });

  it("persists bookmarks and ignores unknown ids", async () => {
    await settle(setPostBookmark("post-002", false));
    await settle(setPostLike("khong-ton-tai", true));
    const thread = await settle(fetchPostThread("post-002"));

    expect(thread?.post.isBookmarkedByCurrentUser).toBe(false);
  });

  it("applies a like before a fetch that was already in flight resolves", async () => {
    const pending = fetchPostThread("post-001");
    void setPostLike("post-001", true);
    const thread = await settle(pending);

    expect(thread?.post.isLikedByCurrentUser).toBe(true);
  });

  it("returns copies, not internal objects", async () => {
    const thread = await settle(fetchPostThread("post-001"));
    thread!.post.likesCount = 9999;
    const again = await settle(fetchPostThread("post-001"));

    expect(again?.post.likesCount).not.toBe(9999);
  });
});

describe("searchPosts", () => {
  const ids = async (query: string) => (await settle(searchPosts(query))).map((post) => post.id);

  it("matches every token, diacritics-insensitive", async () => {
    expect(await ids("binh minh da lat")).toEqual(["post-006"]);
  });

  it("excludes replies", async () => {
    const posts = await settle(searchPosts("zinc"));
    expect(posts.length).toBeGreaterThan(0);
    expect(posts.every((post) => post.parentId === undefined)).toBe(true);
  });

  it("matches author name", async () => {
    const posts = await settle(searchPosts("elena"));
    expect(posts.length).toBeGreaterThan(0);
    expect(posts.every((post) => post.user.username === "elena_v")).toBe(true);
  });

  it("orders by relevance then likes", async () => {
    expect(await ids("nextjs")).toEqual(["post-009", "post-002", "post-007"]);
  });

  it("boosts author-name matches", async () => {
    expect((await ids("antigravity"))[0]).toBe("post-001");
  });

  it("finds a post created this session", async () => {
    const created = await settle(createPost(input("Hello #Fresh"), author));
    expect((await ids("fresh"))[0]).toBe(created.id);
  });

  it("matches the exact tag for a # query", async () => {
    expect(new Set(await ids("#design"))).toEqual(new Set(["post-004", "post-011"]));
    expect(await ids("#des")).toEqual([]);
  });

  it("treats regex characters literally", async () => {
    expect(await ids("c++ (")).toEqual([]);
  });

  it("returns nothing for empty tokens", async () => {
    expect(await ids("#")).toEqual([]);
    expect(await ids("   ")).toEqual([]);
  });
});

describe("fetchPostsByTag", () => {
  it("matches the tag case & diacritics insensitive with the most frequent casing", async () => {
    const page = await settle(fetchPostsByTag("DALAT", "latest"));
    expect(page.tag).toBe("ĐàLạt");
    expect(page.postsCount).toBe(2);
    expect(page.posts.map((post) => post.id)).toEqual(["post-006", "post-012"]);
  });

  it("sorts latest by date and top by likes", async () => {
    const latest = await settle(fetchPostsByTag("nextjs", "latest"));
    const top = await settle(fetchPostsByTag("nextjs", "top"));
    expect(latest.posts.map((post) => post.id)).toEqual(["post-002", "post-007", "post-009"]);
    expect(top.posts.map((post) => post.id)).toEqual(["post-009", "post-002", "post-007"]);
  });

  it("returns an empty page for an unknown tag", async () => {
    expect(await settle(fetchPostsByTag("nope", "top"))).toEqual({ tag: "nope", postsCount: 0, posts: [] });
  });
});

describe("fetchTrendingTags", () => {
  it("counts root posts per tag, count desc then tag asc", async () => {
    expect(await settle(fetchTrendingTags(3))).toEqual([
      { tag: "Minimalism", postsCount: 3 },
      { tag: "NextJS", postsCount: 3 },
      { tag: "ĐàLạt", postsCount: 2 },
    ]);
  });
});

describe("searchPosts latest sort", () => {
  it("orders matches newest first when sort is latest", async () => {
    const posts = await settle(searchPosts("nextjs", SEARCH_LIMIT, "latest"));
    expect(posts.map((post) => post.id)).toEqual(["post-002", "post-007", "post-009"]);
  });

  it("orders exact-tag matches newest first when sort is latest", async () => {
    const posts = await settle(searchPosts("#design", SEARCH_LIMIT, "latest"));
    expect(posts.map((post) => post.id)).toEqual(["post-004", "post-011"]);
  });
});

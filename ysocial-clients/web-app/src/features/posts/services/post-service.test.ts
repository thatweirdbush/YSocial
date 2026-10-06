import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SEED_AUTHORS, SEED_FOLLOWED_AUTHOR_IDS } from "@/mocks/seed-authors";
import type { CreatePostInput } from "../types";
import { __resetFollowGraph, setFollowed } from "@/mocks/follow-graph";
import {
  __resetMockDb,
  createPost,
  createReply,
  deletePost,
  fetchFeed,
  fetchPostsByTag,
  fetchPostThread,
  ForbiddenError,
  NEW_POST_INTERVAL_MS,
  fetchTrendingTags,
  FEED_PAGE_SIZE,
  SEARCH_LIMIT,
  searchPosts,
  setPostBookmark,
  setHideLikeCount,
  setPostLike,
  setPostPinned,
  subscribeToNewPosts,
  updatePostContent,
} from "./post-service";

/** Runs a service call to completion under fake timers. */
async function settle<T>(promise: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return promise;
}

const VIEWER = "v1";
const author = SEED_AUTHORS[4];
const input = (content: string): CreatePostInput => ({ content, images: [], audience: "anyone" });

beforeEach(() => {
  vi.useFakeTimers();
  __resetMockDb();
  __resetFollowGraph();
});

afterEach(() => {
  __resetMockDb();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("fetchFeed", () => {
  it("returns the first page of root posts, newest first", async () => {
    const page = await settle(fetchFeed("forYou", 1, VIEWER));

    expect(page.posts).toHaveLength(FEED_PAGE_SIZE);
    expect(page.posts.every((p) => p.parentId === undefined)).toBe(true);
    const times = page.posts.map((p) => Date.parse(p.createdAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(page.nextPage).toBe(2);
  });

  it("ends pagination on the last page", async () => {
    const page = await settle(fetchFeed("forYou", 2, VIEWER));

    expect(page.posts).toHaveLength(2);
    expect(page.nextPage).toBeUndefined();
  });

  it("follows the viewer's live follow graph", async () => {
    const before = await settle(fetchFeed("following", 1, VIEWER));
    expect(before.posts.some((p) => p.user.id === "author-01")).toBe(false);

    setFollowed(VIEWER, "author-01", true);
    const after = await settle(fetchFeed("following", 1, VIEWER));
    expect(after.posts.some((p) => p.user.id === "author-01")).toBe(true);

    const other = await settle(fetchFeed("following", 1, "v2"));
    expect(other.posts.some((p) => p.user.id === "author-01")).toBe(false);
  });

  it("limits the following tab to followed authors", async () => {
    const page = await settle(fetchFeed("following", 1, VIEWER));

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
    const page = await settle(fetchFeed("forYou", 1, VIEWER));

    expect(page.posts[0].id).toBe(created.id);
  });

  it("persists likes so a refetch keeps them (idempotent set)", async () => {
    const before = await settle(fetchPostThread("post-001"));

    await settle(setPostLike("post-001", true));
    await settle(setPostLike("post-001", true));
    const liked = await settle(fetchFeed("forYou", 1, VIEWER));
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

/** Expects a service call to reject with `type` after its simulated latency. */
async function rejects(promise: Promise<unknown>, type: new (...args: never[]) => Error): Promise<void> {
  const assertion = expect(promise).rejects.toBeInstanceOf(type);
  await vi.runAllTimersAsync();
  await assertion;
}

describe("owner mutations", () => {
  it("rejects non-owners with ForbiddenError and writes nothing", async () => {
    const before = await settle(fetchPostThread("post-001"));

    await rejects(updatePostContent("post-001", "hack", "author-02"), ForbiddenError);
    await rejects(deletePost("post-001", "author-02"), ForbiddenError);
    await rejects(setPostPinned("post-001", true, "author-02"), ForbiddenError);
    await rejects(setHideLikeCount("post-001", true, "author-02"), ForbiddenError);

    expect(await settle(fetchPostThread("post-001"))).toEqual(before);
  });

  it("rejects unknown ids", async () => {
    await rejects(updatePostContent("nope", "x", "author-01"), Error);
    await rejects(deletePost("nope", "author-01"), Error);
  });

  it("updatePostContent re-indexes tags & trims", async () => {
    const updated = await settle(updatePostContent("post-003", "  Mới #Moi  ", "author-03"));

    expect(updated).toMatchObject({ content: "Mới #Moi", isEdited: true });
    expect((await settle(fetchPostsByTag("Moi", "latest"))).posts.map((p) => p.id)).toEqual(["post-003"]);
    expect((await settle(fetchPostsByTag("Minimalism", "latest"))).posts.some((p) => p.id === "post-003")).toBe(false);
  });

  it("deletes a root post with its whole reply tree", async () => {
    const thread = (await settle(fetchPostThread("post-001")))!;
    const expected = [
      "post-001",
      ...thread.replies.map((r) => r.id),
      ...Object.values(thread.childReplies).flat().map((r) => r.id),
    ];

    const { deletedIds } = await settle(deletePost("post-001", "author-01"));

    expect([...deletedIds].sort()).toEqual([...expected].sort());
    expect(await settle(fetchPostThread("post-001"))).toBeNull();
    expect(await settle(fetchPostThread("reply-001-02-01"))).toBeNull();
  });

  it("deleting a reply decrements the parent counter", async () => {
    const before = (await settle(fetchPostThread("post-001")))!.post.commentsCount;

    await settle(deletePost("reply-001-01", "author-03"));

    expect((await settle(fetchPostThread("post-001")))!.post.commentsCount).toBe(before - 1);
  });

  it("keeps at most one pinned post per author", async () => {
    const a = await settle(createPost(input("A"), author));
    const b = await settle(createPost(input("B"), author));

    await settle(setPostPinned(a.id, true, author.id));
    await settle(setPostPinned(b.id, true, author.id));

    expect((await settle(fetchPostThread(a.id)))!.post.isPinned).toBe(false);
    expect((await settle(fetchPostThread(b.id)))!.post.isPinned).toBe(true);

    await settle(setPostPinned(b.id, false, author.id));
    expect((await settle(fetchPostThread(b.id)))!.post.isPinned).toBe(false);
  });

  it("rejects pinning a reply", async () => {
    await rejects(setPostPinned("reply-001-02-01", true, "author-01"), Error);
  });

  it("persists the hidden like count flag", async () => {
    await settle(setHideLikeCount("post-001", true, "author-01"));

    expect((await settle(fetchPostThread("post-001")))!.post.hideLikeCount).toBe(true);
  });
});

describe("subscribeToNewPosts", () => {
  it("runs no timer without subscribers", () => {
    expect(vi.getTimerCount()).toBe(0);
  });

  it("shares one timer between subscribers and emits the same posts to each", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const first = vi.fn();
    const second = vi.fn();

    const unsubscribeFirst = subscribeToNewPosts(first);
    expect(vi.getTimerCount()).toBe(1);
    const unsubscribeSecond = subscribeToNewPosts(second);
    expect(vi.getTimerCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(NEW_POST_INTERVAL_MS);
    expect(first).toHaveBeenCalledTimes(2);
    const ids = first.mock.calls.map(([post]) => post.id);
    expect(second.mock.calls.map(([post]) => post.id)).toEqual(ids);

    unsubscribeFirst();
    unsubscribeFirst();
    await vi.advanceTimersByTimeAsync(NEW_POST_INTERVAL_MS);
    expect(first).toHaveBeenCalledTimes(2);
    expect(second).toHaveBeenCalledTimes(4);

    unsubscribeSecond();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stores generated posts so a refetch shows them", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const listener = vi.fn();
    const unsubscribe = subscribeToNewPosts(listener);

    await vi.advanceTimersByTimeAsync(NEW_POST_INTERVAL_MS);
    unsubscribe();

    const page = await settle(fetchFeed("forYou", 1, VIEWER));
    const emitted = listener.mock.calls.map(([post]) => post.id);
    expect(page.posts.slice(0, 2).map((p) => p.id).sort()).toEqual([...emitted].sort());
  });

  it("resubscribe -> exactly one timer", () => {
    const unsubscribe = subscribeToNewPosts(vi.fn());
    unsubscribe();
    const again = subscribeToNewPosts(vi.fn());

    expect(vi.getTimerCount()).toBe(1);
    again();
  });

  it("pins the random bounds: 0 -> 35s & 1 post, 0.999 -> 54.98s & 2 posts", async () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    const listener = vi.fn();
    const unsubscribe = subscribeToNewPosts(listener);

    await vi.advanceTimersByTimeAsync(34_999);
    expect(listener).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    random.mockReturnValue(0.999);
    listener.mockClear();
    const again = subscribeToNewPosts(listener);
    await vi.advanceTimersByTimeAsync(54_979);
    expect(listener).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(listener).toHaveBeenCalledTimes(2);
    again();
  });

  it("emits 1-2 posts per tick every 35-55s (contract)", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToNewPosts(listener);
    let last = Date.now();

    for (let tick = 0; tick < 10; tick += 1) {
      const before = listener.mock.calls.length;
      await vi.advanceTimersToNextTimerAsync();
      const gap = Date.now() - last;
      last = Date.now();
      expect(gap).toBeGreaterThanOrEqual(35_000);
      expect(gap).toBeLessThanOrEqual(55_000);
      expect([1, 2]).toContain(listener.mock.calls.length - before);
    }
    unsubscribe();
  });

  it("__resetMockDb stops the stream and resets ids & data", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const stale = vi.fn();
    subscribeToNewPosts(stale);
    await vi.advanceTimersByTimeAsync(NEW_POST_INTERVAL_MS);
    // Stream is live: advance a bounded time (runAllTimers would never end)
    const created = createPost(input("tạm biệt"), author);
    await vi.advanceTimersByTimeAsync(1_000);
    await created;

    __resetMockDb();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(NEW_POST_INTERVAL_MS * 2);
    expect(stale).toHaveBeenCalledTimes(2);
    expect(await settle(searchPosts("tạm biệt"))).toEqual([]);

    const fresh = vi.fn();
    const unsubscribe = subscribeToNewPosts(fresh);
    await vi.advanceTimersByTimeAsync(NEW_POST_INTERVAL_MS);
    expect(fresh.mock.calls[0][0].id).toMatch(/-1$/);
    unsubscribe();
  });
});

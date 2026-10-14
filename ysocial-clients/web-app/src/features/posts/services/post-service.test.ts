import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SEED_AUTHORS, SEED_DEMO_ACCOUNT, SEED_FOLLOWED_AUTHOR_IDS } from "@/mocks/seed-authors";
import type { CreatePostInput } from "../types";
import { POST_CONTENT_MAX } from "../utils/post-content";
import { __resetBlockGraph, setBlocked } from "@/mocks/block-graph";
import { __resetPrivacy } from "@/mocks/privacy";
import { __resetRelationGraph, requestFollow, setMutedEdge } from "@/mocks/relation-graph";
import {
  __removePostOnly,
  __resetMockDb,
  createPost,
  createReply,
  deletePost,
  fetchFeed,
  fetchPostsByTag,
  fetchPostThread,
  ForbiddenError,
  NEW_POST_INTERVAL_MS,
  fetchSavedPosts,
  fetchTrendingTags,
  fetchUserPosts,
  FEED_PAGE_SIZE,
  isPostPubliclyVisible,
  PROFILE_PAGE_SIZE,
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
const DEMO_ID = "1";
// Public author: private seed authors (index 4 & 6) are invisible to a plain viewer
const author = SEED_AUTHORS[3];
const SEED_DEMO_AUTHOR = SEED_DEMO_ACCOUNT;
const input = (content: string): CreatePostInput => ({ content, images: [], audience: "anyone" });

beforeEach(() => {
  vi.useFakeTimers();
  __resetMockDb();
  __resetRelationGraph();
  __resetBlockGraph();
  __resetPrivacy();
});

afterEach(() => {
  __resetMockDb();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("fetchFeed", () => {
  it("returns the first page of root posts, newest first", async () => {
    const page = await settle(fetchFeed("forYou", 1, DEMO_ID));

    expect(page.posts).toHaveLength(FEED_PAGE_SIZE);
    expect(page.posts.every((p) => p.parentId === undefined)).toBe(true);
    const times = page.posts.map((p) => Date.parse(p.createdAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(page.nextPage).toBe(2);
  });

  it("ends pagination on the last page", async () => {
    const page = await settle(fetchFeed("forYou", 2, DEMO_ID));

    expect(page.posts).toHaveLength(6);
    expect(page.nextPage).toBeUndefined();
  });

  it("follows the viewer's live follow graph", async () => {
    const before = await settle(fetchFeed("following", 1, VIEWER));
    expect(before.posts.some((p) => p.user.id === "author-01")).toBe(false);

    requestFollow(VIEWER, "author-01", false);
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
    const thread = await settle(fetchPostThread("post-001", VIEWER));

    expect(thread?.post.id).toBe("post-001");
    expect(thread?.parent).toBeUndefined();
    expect(thread?.replies.every((r) => r.parentId === "post-001")).toBe(true);
    const times = thread!.replies.map((r) => Date.parse(r.createdAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(thread?.childReplies["reply-001-02"]).toHaveLength(3);
    expect(thread?.childReplies["reply-001-01"]).toEqual([]);
  });

  it("includes the parent for a reply thread", async () => {
    const thread = await settle(fetchPostThread("reply-001-02", VIEWER));

    expect(thread?.parent?.id).toBe("post-001");
  });

  it("returns null for an unknown id", async () => {
    expect(await settle(fetchPostThread("khong-ton-tai", VIEWER))).toBeNull();
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
    const before = await settle(fetchPostThread("post-001", VIEWER));
    await settle(createReply("post-001", input("hi"), author));
    const after = await settle(fetchPostThread("post-001", VIEWER));

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
    const before = await settle(fetchPostThread("post-001", VIEWER));

    await settle(setPostLike("post-001", true));
    await settle(setPostLike("post-001", true));
    const liked = await settle(fetchFeed("forYou", 1, VIEWER));
    const post = liked.posts.find((p) => p.id === "post-001")!;

    expect(post.isLikedByCurrentUser).toBe(true);
    expect(post.likesCount).toBe(before!.post.likesCount + 1);

    await settle(setPostLike("post-001", false));
    const unliked = await settle(fetchPostThread("post-001", VIEWER));
    expect(unliked?.post.likesCount).toBe(before!.post.likesCount);
  });

  it("persists bookmarks and ignores unknown ids", async () => {
    await settle(setPostBookmark("post-002", false));
    await settle(setPostLike("khong-ton-tai", true));
    const thread = await settle(fetchPostThread("post-002", VIEWER));

    expect(thread?.post.isBookmarkedByCurrentUser).toBe(false);
  });

  it("applies a like before a fetch that was already in flight resolves", async () => {
    const pending = fetchPostThread("post-001", VIEWER);
    void setPostLike("post-001", true);
    const thread = await settle(pending);

    expect(thread?.post.isLikedByCurrentUser).toBe(true);
  });

  it("returns copies, not internal objects", async () => {
    const thread = await settle(fetchPostThread("post-001", VIEWER));
    thread!.post.likesCount = 9999;
    const again = await settle(fetchPostThread("post-001", VIEWER));

    expect(again?.post.likesCount).not.toBe(9999);
  });
});

describe("searchPosts", () => {
  const ids = async (query: string) => (await settle(searchPosts(query, VIEWER))).map((post) => post.id);

  it("matches every token, diacritics-insensitive", async () => {
    expect(await ids("binh minh da lat")).toEqual(["post-006"]);
  });

  it("excludes replies", async () => {
    const posts = await settle(searchPosts("zinc", VIEWER));
    expect(posts.length).toBeGreaterThan(0);
    expect(posts.every((post) => post.parentId === undefined)).toBe(true);
  });

  it("matches author name", async () => {
    const posts = await settle(searchPosts("elena", VIEWER));
    expect(posts.length).toBeGreaterThan(0);
    expect(posts.every((post) => post.user.username === "elena_v")).toBe(true);
  });

  it("orders by relevance then likes", async () => {
    // post-007 (private author) is hidden from this viewer
    expect(await ids("nextjs")).toEqual(["post-009", "post-002"]);
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
    const page = await settle(fetchPostsByTag("DALAT", "latest", VIEWER));
    expect(page.tag).toBe("ĐàLạt");
    expect(page.postsCount).toBe(2);
    expect(page.posts.map((post) => post.id)).toEqual(["post-006", "post-012"]);
  });

  it("sorts latest by date and top by likes", async () => {
    const latest = await settle(fetchPostsByTag("nextjs", "latest", VIEWER));
    const top = await settle(fetchPostsByTag("nextjs", "top", VIEWER));
    expect(latest.posts.map((post) => post.id)).toEqual(["post-002", "post-009"]);
    expect(top.posts.map((post) => post.id)).toEqual(["post-009", "post-002"]);
  });

  it("returns an empty page for an unknown tag", async () => {
    expect(await settle(fetchPostsByTag("nope", "top", VIEWER))).toEqual({ tag: "nope", postsCount: 0, posts: [] });
  });
});

describe("fetchTrendingTags", () => {
  it("counts public root posts per tag, count desc then tag asc", async () => {
    // post-007 (#NextJS) is by a private author, so NextJS counts 2 instead of 3 and ties with ĐàLạt & Design
    expect(await settle(fetchTrendingTags(4))).toEqual([
      { tag: "Minimalism", postsCount: 3 },
      { tag: "ĐàLạt", postsCount: 2 },
      { tag: "Design", postsCount: 2 },
      { tag: "NextJS", postsCount: 2 },
    ]);
  });

  it("never counts private authors or close friends posts, so a tag always leads to visible posts", async () => {
    await settle(createPost({ ...input("secret #hiddentag"), visibility: "closeFriends" }, SEED_AUTHORS[1]));
    await settle(createPost(input("open #opentag"), SEED_AUTHORS[1]));

    const tags = (await settle(fetchTrendingTags(50))).map((stat) => stat.tag);

    expect(tags).toContain("opentag");
    expect(tags).not.toContain("hiddentag");
    expect(tags).not.toContain("VietCode");
    expect(tags).not.toContain("Zustand");
  });

  it("never counts replies under a close friends root", async () => {
    const root = await settle(createPost({ ...input("secret thread"), visibility: "closeFriends" }, SEED_AUTHORS[1]));
    await settle(createReply(root.id, input("reply #cfreply"), SEED_AUTHORS[1]));

    const tags = (await settle(fetchTrendingTags(50))).map((stat) => stat.tag);

    expect(tags).not.toContain("cfreply");
  });
});

describe("searchPosts latest sort", () => {
  it("orders matches newest first when sort is latest", async () => {
    const posts = await settle(searchPosts("nextjs", VIEWER, SEARCH_LIMIT, "latest"));
    expect(posts.map((post) => post.id)).toEqual(["post-002", "post-009"]);
  });

  it("orders exact-tag matches newest first when sort is latest", async () => {
    const posts = await settle(searchPosts("#design", VIEWER, SEARCH_LIMIT, "latest"));
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
    const before = await settle(fetchPostThread("post-001", VIEWER));

    await rejects(updatePostContent("post-001", "hack", "author-02"), ForbiddenError);
    await rejects(deletePost("post-001", "author-02"), ForbiddenError);
    await rejects(setPostPinned("post-001", true, "author-02"), ForbiddenError);
    await rejects(setHideLikeCount("post-001", true, "author-02"), ForbiddenError);

    expect(await settle(fetchPostThread("post-001", VIEWER))).toEqual(before);
  });

  it("rejects unknown ids", async () => {
    await rejects(updatePostContent("nope", "x", "author-01"), Error);
    await rejects(deletePost("nope", "author-01"), Error);
  });

  it("updatePostContent re-indexes tags & trims", async () => {
    const updated = await settle(updatePostContent("post-003", "  Mới #Moi  ", "author-03"));

    expect(updated).toMatchObject({ content: "Mới #Moi", isEdited: true });
    expect((await settle(fetchPostsByTag("Moi", "latest", VIEWER))).posts.map((p) => p.id)).toEqual(["post-003"]);
    expect((await settle(fetchPostsByTag("Minimalism", "latest", VIEWER))).posts.some((p) => p.id === "post-003")).toBe(false);
  });

  it("updatePostContent rejects content over the limit or empty text without images", async () => {
    await rejects(updatePostContent("post-002", "a".repeat(POST_CONTENT_MAX + 1), "author-02"), Error);
    await rejects(updatePostContent("post-002", "   ", "author-02"), Error);

    expect(await settle(updatePostContent("post-003", "  ", "author-03"))).toMatchObject({ content: "" });
    expect((await settle(fetchPostThread("post-002", VIEWER)))!.post.isEdited).toBeFalsy();
  });

  it("deletes a root post with its whole reply tree", async () => {
    // The viewer follows the private authors so the visible thread is the complete tree
    requestFollow(VIEWER, "author-05", false);
    requestFollow(VIEWER, "author-07", false);
    const thread = (await settle(fetchPostThread("post-001", VIEWER)))!;
    const expected = [
      "post-001",
      ...thread.replies.map((r) => r.id),
      ...Object.values(thread.childReplies).flat().map((r) => r.id),
    ];

    const { deletedIds } = await settle(deletePost("post-001", "author-01"));

    expect([...deletedIds].sort()).toEqual([...expected].sort());
    expect(await settle(fetchPostThread("post-001", VIEWER))).toBeNull();
    expect(await settle(fetchPostThread("reply-001-02-01", VIEWER))).toBeNull();
  });

  it("deleting a reply decrements the parent counter", async () => {
    const before = (await settle(fetchPostThread("post-001", VIEWER)))!.post.commentsCount;

    await settle(deletePost("reply-001-01", "author-03"));

    expect((await settle(fetchPostThread("post-001", VIEWER)))!.post.commentsCount).toBe(before - 1);
  });

  it("keeps at most one pinned post per author", async () => {
    const a = await settle(createPost(input("A"), author));
    const b = await settle(createPost(input("B"), author));

    await settle(setPostPinned(a.id, true, author.id));
    await settle(setPostPinned(b.id, true, author.id));

    expect((await settle(fetchPostThread(a.id, VIEWER)))!.post.isPinned).toBe(false);
    expect((await settle(fetchPostThread(b.id, VIEWER)))!.post.isPinned).toBe(true);

    await settle(setPostPinned(b.id, false, author.id));
    expect((await settle(fetchPostThread(b.id, VIEWER)))!.post.isPinned).toBe(false);
  });

  it("rejects pinning a reply", async () => {
    await rejects(setPostPinned("reply-001-02-01", true, "author-01"), Error);
  });

  it("persists the hidden like count flag", async () => {
    await settle(setHideLikeCount("post-001", true, "author-01"));

    expect((await settle(fetchPostThread("post-001", VIEWER)))!.post.hideLikeCount).toBe(true);
  });
});

describe("fetchUserPosts", () => {
  const DEMO = "1";

  it("threads: only the author's roots, pinned post first, then newest first", async () => {
    const { posts, parents, nextPage } = await settle(fetchUserPosts(DEMO, "threads", 1, DEMO));

    expect(posts.map((post) => post.id)).toEqual(["post-demo-01", "post-demo-02", "post-demo-03", "post-demo-04"]);
    expect(posts.every((post) => post.user.id === DEMO && post.parentId === undefined)).toBe(true);
    expect(parents).toEqual([]);
    expect(nextPage).toBeUndefined();
  });

  it("threads: a newly pinned older post leads page 1 and is not repeated", async () => {
    await settle(setPostPinned("post-demo-04", true, DEMO));

    const first = await settle(fetchUserPosts(DEMO, "threads", 1, DEMO));
    expect(first.posts.map((post) => post.id)).toEqual(["post-demo-04", "post-demo-01", "post-demo-02", "post-demo-03"]);
    expect(new Set(first.posts.map((post) => post.id)).size).toBe(first.posts.length);
  });

  it("threads: pages by PROFILE_PAGE_SIZE and excludes the pinned post from later pages", async () => {
    for (let n = 0; n < PROFILE_PAGE_SIZE; n += 1) {
      await settle(createPost(input(`extra ${n}`), SEED_DEMO_AUTHOR));
    }
    await settle(setPostPinned("post-demo-04", true, DEMO));

    const first = await settle(fetchUserPosts(DEMO, "threads", 1, DEMO));
    const second = await settle(fetchUserPosts(DEMO, "threads", 2, DEMO));

    expect(first.posts).toHaveLength(PROFILE_PAGE_SIZE);
    expect(first.posts[0].id).toBe("post-demo-04");
    expect(first.nextPage).toBe(2);
    expect(second.posts.some((post) => post.id === "post-demo-04")).toBe(false);
    expect(second.nextPage).toBeUndefined();
  });

  it("replies: only the author's replies with their parent references", async () => {
    const { posts, parents } = await settle(fetchUserPosts(DEMO, "replies", 1, DEMO));

    expect(posts.map((post) => post.id)).toEqual(["reply-demo-01", "reply-demo-02"]);
    expect(parents).toEqual([
      expect.objectContaining({ id: "post-003", deleted: false, author: expect.objectContaining({ username: "anquoc.dev" }) }),
      expect.objectContaining({ id: "post-006", deleted: false, author: expect.objectContaining({ username: "giahan.photo" }) }),
    ]);
  });

  it("replies: a removed parent becomes a deleted marker, never a renderable post", async () => {
    __removePostOnly("post-003");

    const { posts, parents } = await settle(fetchUserPosts(DEMO, "replies", 1, DEMO));

    expect(posts.map((post) => post.id)).toContain("reply-demo-01");
    const marker = parents.find((parent) => parent.id === "post-003");
    expect(marker).toEqual({ id: "post-003", deleted: true });
    expect(posts.some((post) => post.id === "post-003")).toBe(false);
  });

  it("media: only root posts that carry images", async () => {
    const { posts } = await settle(fetchUserPosts(DEMO, "media", 1, DEMO));
    expect(posts.map((post) => post.id)).toEqual(["post-demo-02", "post-demo-03"]);
  });

  it("excludes tombstoned (deleted) posts", async () => {
    await settle(deletePost("post-demo-02", DEMO));
    const { posts } = await settle(fetchUserPosts(DEMO, "threads", 1, DEMO));
    expect(posts.some((post) => post.id === "post-demo-02")).toBe(false);
  });
});

describe("fetchSavedPosts", () => {
  it("returns only bookmarked posts, newest first, including bookmarked replies", async () => {
    await settle(setPostBookmark("reply-demo-01", true));
    const { posts, nextPage } = await settle(fetchSavedPosts(DEMO_ID, 1));

    expect(posts.every((post) => post.isBookmarkedByCurrentUser)).toBe(true);
    expect(posts.map((post) => post.id)).toContain("reply-demo-01");
    const times = posts.map((post) => Date.parse(post.createdAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(nextPage).toBeUndefined();
  });

  it("pages by PROFILE_PAGE_SIZE", async () => {
    // post-005 & post-007 (private authors) are hidden from the viewer, the close friends posts are not
    const ids = ["post-001", "post-002", "post-003", "post-004", "post-005", "post-006", "post-007", "post-008", "post-009", "post-010", "post-011", "post-012", "post-cf-01", "post-cf-02"];
    for (const id of ids) await settle(setPostBookmark(id, true));

    const first = await settle(fetchSavedPosts(DEMO_ID, 1));
    const second = await settle(fetchSavedPosts(DEMO_ID, 2));

    expect(first.posts).toHaveLength(PROFILE_PAGE_SIZE);
    expect(first.nextPage).toBe(2);
    expect(second.posts.length).toBeGreaterThan(0);
    expect(second.nextPage).toBeUndefined();
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

  it("stops the timer when the last listener unsubscribes inside its callback", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const listener = vi.fn(() => unsubscribe());
    const unsubscribe = subscribeToNewPosts(listener);

    await vi.advanceTimersByTimeAsync(NEW_POST_INTERVAL_MS);

    expect(listener).toHaveBeenCalledTimes(1);
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
    expect(await settle(searchPosts("tạm biệt", VIEWER))).toEqual([]);

    const fresh = vi.fn();
    const unsubscribe = subscribeToNewPosts(fresh);
    await vi.advanceTimersByTimeAsync(NEW_POST_INTERVAL_MS);
    expect(fresh.mock.calls[0][0].id).toMatch(/-1$/);
    unsubscribe();
  });
});

describe("visibility enforcement", () => {
  const ids = (posts: Array<{ id: string }>) => posts.map((post) => post.id);

  async function allFeedIds(tab: "forYou" | "following", viewer: string): Promise<string[]> {
    const result: string[] = [];
    let page: number | undefined = 1;
    while (page) {
      const current: Awaited<ReturnType<typeof fetchFeed>> = await settle(fetchFeed(tab, page, viewer));
      result.push(...ids(current.posts));
      page = current.nextPage;
    }
    return result;
  }

  it("hides private authors and close friends posts the viewer is not marked for", async () => {
    const feed = await allFeedIds("forYou", DEMO_ID);

    expect(feed).toContain("post-cf-01");
    expect(feed).toContain("post-cf-02");
    expect(feed).not.toContain("post-cf-03");
    expect(feed).not.toContain("post-007");
    expect(feed).not.toContain("post-005");
  });

  it("shows a guest only public posts by public authors", async () => {
    const feed = await allFeedIds("forYou", "me");

    expect(feed.some((id) => id.startsWith("post-cf-"))).toBe(false);
    expect(feed.some((id) => id.startsWith("post-demo-"))).toBe(false);
    expect(feed).not.toContain("post-007");
  });

  it("fills pages after filtering instead of leaving them short", async () => {
    for (let n = 0; n < 12; n += 1) await settle(createPost(input(`public ${n}`), SEED_AUTHORS[3]));

    const first = await settle(fetchFeed("forYou", 1, VIEWER));
    const second = await settle(fetchFeed("forYou", 2, VIEWER));

    expect(first.posts).toHaveLength(FEED_PAGE_SIZE);
    expect(first.nextPage).toBe(2);
    expect(second.posts.length).toBeGreaterThan(0);
    expect(ids(first.posts)).not.toContain("post-007");
  });

  it("hides a muted author from both feeds but keeps the profile", async () => {
    setMutedEdge(DEMO_ID, "author-02", true);

    expect((await allFeedIds("forYou", DEMO_ID)).some((id) => id === "post-002" || id === "post-010")).toBe(false);
    expect((await allFeedIds("following", DEMO_ID)).some((id) => id === "post-002")).toBe(false);
    const profile = await settle(fetchUserPosts("author-02", "threads", 1, DEMO_ID));
    expect(ids(profile.posts)).toContain("post-002");
  });

  it("locks a private profile for a non-accepted viewer but not for its owner", async () => {
    expect(await settle(fetchUserPosts("author-07", "threads", 1, DEMO_ID))).toMatchObject({ posts: [], locked: true });
    expect(await settle(fetchUserPosts("author-07", "threads", 1, "author-07"))).toMatchObject({ locked: false });
    expect((await settle(fetchUserPosts("author-07", "threads", 1, "author-07"))).posts.length).toBeGreaterThan(0);
    expect(await settle(fetchUserPosts("author-01", "threads", 1, "me"))).toMatchObject({ locked: false });
  });

  it("hides close friends posts on a public profile from viewers who are not marked", async () => {
    const forDemo = await settle(fetchUserPosts("author-03", "threads", 1, DEMO_ID));
    const forOther = await settle(fetchUserPosts("author-03", "threads", 1, VIEWER));

    expect(ids(forDemo.posts)).toContain("post-cf-01");
    expect(ids(forOther.posts)).not.toContain("post-cf-01");
  });

  it("returns null for a thread whose root the viewer cannot see", async () => {
    expect(await settle(fetchPostThread("post-cf-03", DEMO_ID))).toBeNull();
    expect(await settle(fetchPostThread("post-cf-01", DEMO_ID))).not.toBeNull();
    expect(await settle(fetchPostThread("post-007", DEMO_ID))).toBeNull();
    expect(await settle(fetchPostThread("post-001", "me"))).not.toBeNull();
  });

  it("filters replies by blocked authors", async () => {
    const reply = await settle(createReply("post-001", input("blocked voice"), SEED_AUTHORS[3]));
    setBlocked(DEMO_ID, SEED_AUTHORS[3].id, true);

    const thread = await settle(fetchPostThread("post-001", DEMO_ID));
    expect(ids(thread!.replies)).not.toContain(reply.id);
  });

  it("filters search and tag results", async () => {
    await settle(createPost({ ...input("zebraquartz #zebratag"), visibility: "closeFriends" }, SEED_AUTHORS[1]));
    await settle(createPost({ ...input("zebraquartz #zebratag"), visibility: "closeFriends" }, SEED_AUTHORS[2]));

    const search = await settle(searchPosts("zebraquartz", DEMO_ID));
    expect(search.map((post) => post.user.id)).toEqual(["author-03"]);
    const tag = await settle(fetchPostsByTag("zebratag", "latest", DEMO_ID));
    expect(tag.posts.map((post) => post.user.id)).toEqual(["author-03"]);
    expect(await settle(searchPosts("zebraquartz", VIEWER))).toEqual([]);
  });

  it("filters saved posts", async () => {
    await settle(setPostBookmark("post-cf-03", true));
    await settle(setPostBookmark("post-cf-01", true));

    const { posts } = await settle(fetchSavedPosts(DEMO_ID, 1));
    expect(ids(posts)).toContain("post-cf-01");
    expect(ids(posts)).not.toContain("post-cf-03");
  });

  it("stores the close friends visibility of a new post and applies it", async () => {
    const created = await settle(createPost({ ...input("secret"), visibility: "closeFriends" }, SEED_AUTHORS[1]));

    expect(created.visibility).toBe("closeFriends");
    expect(await settle(fetchPostThread(created.id, DEMO_ID))).toBeNull();
    expect((await settle(fetchPostThread(created.id, SEED_AUTHORS[1].id)))?.post.id).toBe(created.id);
    expect((await settle(createPost(input("open"), SEED_AUTHORS[1]))).visibility).toBeUndefined();
  });

  it("streams only public posts by public authors", async () => {
    const received: Array<{ visibility?: string; user: { id: string } }> = [];
    const unsubscribe = subscribeToNewPosts((post) => received.push(post));

    await vi.advanceTimersByTimeAsync(NEW_POST_INTERVAL_MS * 1.3 * 20);
    unsubscribe();

    expect(received.length).toBeGreaterThan(0);
    expect(received.every((post) => post.visibility === undefined)).toBe(true);
    expect(received.some((post) => ["author-05", "author-07"].includes(post.user.id))).toBe(false);
  });

  it("reports whether a post is visible to everyone", () => {
    const post = (authorIndex: number, visibility?: "closeFriends") => ({ user: SEED_AUTHORS[authorIndex], visibility });

    expect(isPostPubliclyVisible(post(0))).toBe(true);
    expect(isPostPubliclyVisible(post(2, "closeFriends"))).toBe(false);
    expect(isPostPubliclyVisible(post(6))).toBe(false);
  });
});

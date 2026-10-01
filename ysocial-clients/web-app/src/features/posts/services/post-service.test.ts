import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOCK_AUTHORS, MOCK_FOLLOWED_AUTHOR_IDS } from "../mocks/mock-authors";
import type { CreatePostInput } from "../types";
import { __resetMockDb, createPost, createReply, fetchFeed, fetchPostThread, FEED_PAGE_SIZE } from "./post-service";

/** Runs a service call to completion under fake timers. */
async function settle<T>(promise: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return promise;
}

const author = MOCK_AUTHORS[4];
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
    expect(page.posts.every((p) => MOCK_FOLLOWED_AUTHOR_IDS.includes(p.user.id))).toBe(true);
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

  it("returns copies, not internal objects", async () => {
    const thread = await settle(fetchPostThread("post-001"));
    thread!.post.likesCount = 9999;
    const again = await settle(fetchPostThread("post-001"));

    expect(again?.post.likesCount).not.toBe(9999);
  });
});

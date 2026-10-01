import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { PostItem } from "../types";
import { resetPostStore, usePostStore, useReplyIds } from "./post-store";

const makePost = (id: string, overrides: Partial<PostItem> = {}): PostItem => ({
  id,
  content: `content ${id}`,
  createdAt: "2026-10-01T00:00:00.000Z",
  likesCount: 0,
  commentsCount: 0,
  isLikedByCurrentUser: false,
  isBookmarkedByCurrentUser: false,
  user: { id: "u1", displayName: "User", username: "user" },
  ...overrides,
});

const state = () => usePostStore.getState();
const actions = () => usePostStore.getState().actions;

beforeEach(() => {
  resetPostStore();
});

describe("toggleLike", () => {
  it("likes then unlikes", () => {
    actions().upsertPosts([makePost("p", { likesCount: 5 })]);

    actions().toggleLike("p");
    expect(state().posts.p).toMatchObject({ likesCount: 6, isLikedByCurrentUser: true });

    actions().toggleLike("p");
    expect(state().posts.p).toMatchObject({ likesCount: 5, isLikedByCurrentUser: false });
  });

  it("never drops likesCount below 0", () => {
    actions().upsertPosts([makePost("p", { likesCount: 0, isLikedByCurrentUser: true })]);

    actions().toggleLike("p");

    expect(state().posts.p).toMatchObject({ likesCount: 0, isLikedByCurrentUser: false });
  });

  it("seeds missing post", () => {
    actions().toggleLike("x", makePost("x", { likesCount: 2 }));

    expect(state().posts.x).toMatchObject({ likesCount: 3, isLikedByCurrentUser: true });
  });

  it("ignores a missing id without seed", () => {
    actions().upsertPosts([makePost("p")]);
    const before = state().posts;

    actions().toggleLike("missing");

    expect(state().posts).toBe(before);
  });
});

describe("toggleBookmark", () => {
  it("toggles the bookmark flag", () => {
    actions().upsertPosts([makePost("p")]);

    actions().toggleBookmark("p");
    expect(state().posts.p.isBookmarkedByCurrentUser).toBe(true);

    actions().toggleBookmark("p");
    expect(state().posts.p.isBookmarkedByCurrentUser).toBe(false);
  });

  it("seeds missing post and ignores missing id without seed", () => {
    actions().toggleBookmark("x", makePost("x"));
    expect(state().posts.x.isBookmarkedByCurrentUser).toBe(true);

    const before = state().posts;
    actions().toggleBookmark("missing");
    expect(state().posts).toBe(before);
  });
});

describe("replies", () => {
  it("addReply prepends, bumps the counter and dedupes", () => {
    actions().upsertPosts([makePost("p", { commentsCount: 1 })]);
    actions().setReplies("p", ["old"]);
    const reply = makePost("r", { parentId: "p" });

    actions().addReply("p", reply);
    expect(state().replyIds.p).toEqual(["r", "old"]);
    expect(state().posts.p.commentsCount).toBe(2);
    expect(state().posts.r).toEqual(reply);

    actions().addReply("p", reply);
    expect(state().replyIds.p).toEqual(["r", "old"]);
    expect(state().posts.p.commentsCount).toBe(2);
  });

  it("removeReply restores the counter, floored at 0", () => {
    actions().upsertPosts([makePost("p")]);
    actions().addReply("p", makePost("r", { parentId: "p" }));

    actions().removeReply("p", "r");
    expect(state().replyIds.p).toEqual([]);
    expect(state().posts.p.commentsCount).toBe(0);

    actions().upsertPosts([makePost("q", { commentsCount: 0 })]);
    actions().setReplies("q", ["s"]);
    actions().removeReply("q", "s");
    expect(state().posts.q.commentsCount).toBe(0);
  });
});

describe("feed", () => {
  it("replaces, appends and prepends feed ids", () => {
    actions().setFeedPage("forYou", ["a", "b"], false);
    actions().setFeedPage("forYou", ["c"], true);
    expect(state().feedIds.forYou).toEqual(["a", "b", "c"]);

    const post = makePost("n");
    actions().prependPost("forYou", post);
    expect(state().feedIds.forYou).toEqual(["n", "a", "b", "c"]);
    expect(state().posts.n).toEqual(post);
    expect(state().feedIds.following).toEqual([]);
  });
});

describe("selectors", () => {
  it("returns a stable empty array for unknown parents", () => {
    const { result, rerender } = renderHook(() => useReplyIds("unknown"));
    const first = result.current;

    rerender();
    rerender();

    expect(result.current).toBe(first);
    expect(first).toEqual([]);
  });
});

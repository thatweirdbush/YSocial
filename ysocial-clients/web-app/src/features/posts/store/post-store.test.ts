import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { FeedTab, PostItem } from "../types";
import { getPendingFeed } from "../utils/pending-feed";
import { INCOMING_CAP, resetPostStore, useIsDeleted, usePostStore, useReplyIds } from "./post-store";

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

  it("dedupes ids when appending a page that overlaps the cached feed", () => {
    actions().setFeedPage("forYou", ["a", "b"], false);
    actions().prependPost("forYou", makePost("n"));

    actions().setFeedPage("forYou", ["b", "c"], true);

    expect(state().feedIds.forYou).toEqual(["n", "a", "b", "c"]);
  });

  it("tracks per-tab paging meta", () => {
    expect(state().feedMeta.forYou).toEqual({ loaded: false, nextPage: undefined });

    actions().setFeedPage("forYou", ["a"], false, 2);
    expect(state().feedMeta.forYou).toEqual({ loaded: true, nextPage: 2 });

    actions().setFeedPage("forYou", ["b"], true);
    expect(state().feedMeta.forYou).toEqual({ loaded: true, nextPage: undefined });
    expect(state().feedMeta.following.loaded).toBe(false);
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

// #region Incoming buffer & deletion
const alice = { id: "a1", displayName: "Alice", username: "alice" };
const bob = { id: "b1", displayName: "Bob", username: "bob" };
const pending = (tab: FeedTab, followed: string[] = []) =>
  getPendingFeed(state().posts, state(), tab, new Set(followed));

describe("bufferIncoming", () => {
  it("prepends new posts and caches them", () => {
    actions().bufferIncoming(makePost("n1"));
    actions().bufferIncoming(makePost("n2"));

    expect(state().incoming).toEqual(["n2", "n1"]);
    expect(state().posts.n2).toBeDefined();
  });

  it("dedupes against incoming, tombstones & posts already in both feeds", () => {
    actions().bufferIncoming(makePost("n1"));
    actions().bufferIncoming(makePost("n1"));
    actions().setFeedPage("forYou", ["both"], false);
    actions().setFeedPage("following", ["both"], false);
    actions().bufferIncoming(makePost("both"));
    actions().markDeleted(["dead"]);
    actions().bufferIncoming(makePost("dead"));

    expect(state().incoming).toEqual(["n1"]);
  });

  it("marks a post already in one feed as consumed for that feed", () => {
    actions().setFeedPage("forYou", ["p1"], false);
    actions().bufferIncoming(makePost("p1"));

    expect(state().consumedIncoming.forYou.p1).toBe(true);
    expect(state().consumedIncoming.following.p1).toBeUndefined();
  });

  it("caps at 20, records the dropped author only for tabs that had not consumed it", () => {
    actions().bufferIncoming(makePost("old", { user: alice }));
    actions().flushPending("forYou", ["old"]);
    for (let i = 0; i < INCOMING_CAP; i += 1) actions().bufferIncoming(makePost(`n${i}`, { user: bob }));

    expect(state().incoming).toHaveLength(INCOMING_CAP);
    expect(state().incoming).not.toContain("old");
    expect(state().droppedAuthorIds).toEqual({ forYou: [], following: ["a1"] });
    expect(state().consumedIncoming.forYou.old).toBeUndefined();
  });
});

describe("flushPending", () => {
  it("prepends the given ids and consumes only them for that tab", () => {
    actions().setFeedPage("forYou", ["f1"], false);
    actions().bufferIncoming(makePost("n1"));
    actions().bufferIncoming(makePost("n2"));

    actions().flushPending("forYou", ["n2"]);

    expect(state().feedIds.forYou).toEqual(["n2", "f1"]);
    expect(pending("forYou").ids).toEqual(["n1"]);
    expect(pending("following", ["u1"]).ids).toEqual(["n2", "n1"]);
  });

  it("flush skips ids already in feed (no duplicates)", () => {
    actions().setFeedPage("forYou", ["n1", "f1"], false);
    actions().bufferIncoming(makePost("n2"));

    actions().flushPending("forYou", ["n2", "n1"]);

    expect(state().feedIds.forYou).toEqual(["n2", "n1", "f1"]);
  });

  it("clears dropped authors of that tab", () => {
    for (let i = 0; i <= INCOMING_CAP; i += 1) actions().bufferIncoming(makePost(`n${i}`));

    actions().flushPending("forYou", []);

    expect(state().droppedAuthorIds.forYou).toEqual([]);
    expect(state().droppedAuthorIds.following).toEqual(["u1"]);
  });
});

describe("consumeIncoming & page-1 loads", () => {
  it("consumeIncoming consumes ids and clears dropped authors", () => {
    for (let i = 0; i <= INCOMING_CAP; i += 1) actions().bufferIncoming(makePost(`n${i}`));

    actions().consumeIncoming("forYou", ["n20"]);

    expect(state().consumedIncoming.forYou.n20).toBe(true);
    expect(pending("forYou").overflow).toBe(false);
  });

  it("setFeedPage page 1 consumes incoming ids it contains", () => {
    actions().bufferIncoming(makePost("n1"));
    actions().bufferIncoming(makePost("n2"));

    actions().setFeedPage("forYou", ["n2", "f1"], false);

    expect(pending("forYou").ids).toEqual(["n1"]);
  });

  it("page-1 refetch clears overflow; append keeps it", () => {
    for (let i = 0; i <= INCOMING_CAP; i += 1) actions().bufferIncoming(makePost(`n${i}`));
    expect(pending("forYou").overflow).toBe(true);

    actions().setFeedPage("forYou", ["x"], true);
    expect(pending("forYou").overflow).toBe(true);

    actions().setFeedPage("forYou", ["x"], false);
    expect(pending("forYou").overflow).toBe(false);
  });
});

describe("tombstones", () => {
  it("upsertPosts, setReplies & setFeedPage skip tombstoned ids", () => {
    actions().markDeleted(["dead"]);

    actions().upsertPosts([makePost("dead"), makePost("alive")]);
    actions().setReplies("alive", ["dead", "r1"]);
    actions().setFeedPage("forYou", ["dead", "alive"], false);

    expect(state().posts.dead).toBeUndefined();
    expect(state().replyIds.alive).toEqual(["r1"]);
    expect(state().feedIds.forYou).toEqual(["alive"]);
  });

  it("useIsDeleted reflects tombstones", () => {
    const { result, rerender } = renderHook(() => useIsDeleted("p"));
    expect(result.current).toBe(false);

    actions().markDeleted(["p"]);
    rerender();
    expect(result.current).toBe(true);
  });
});

/** Root `r` (in both feeds & incoming) with replies r1 (child r1a) & r2, under nothing. */
function seedThread() {
  actions().upsertPosts([
    makePost("r", { commentsCount: 2 }),
    makePost("r1", { parentId: "r", commentsCount: 1 }),
    makePost("r1a", { parentId: "r1" }),
    makePost("r2", { parentId: "r" }),
    makePost("x"),
  ]);
  actions().setFeedPage("forYou", ["x", "r"], false);
  actions().setFeedPage("following", ["r"], false);
  actions().setReplies("r", ["r2", "r1"]);
  actions().setReplies("r1", ["r1a"]);
}

describe("removePost", () => {
  it("removes a root with its cached subtree everywhere", () => {
    seedThread();

    const snapshot = actions().removePost("r");

    for (const id of ["r", "r1", "r1a", "r2"]) {
      expect(state().posts[id]).toBeUndefined();
      expect(state().deletedIds[id]).toBe(true);
    }
    expect(state().feedIds).toEqual({ forYou: ["x"], following: [] });
    expect(state().replyIds.r).toBeUndefined();
    expect(state().replyIds.r1).toBeUndefined();
    expect(snapshot).toMatchObject({ feedIndex: { forYou: 1, following: 0 }, incomingIndex: -1, replyIndex: -1 });
    expect(snapshot?.posts.map((p) => p.id)).toEqual(["r", "r2", "r1", "r1a"]);
  });

  it("removes a reply and decrements the parent counter", () => {
    seedThread();

    const snapshot = actions().removePost("r1");

    expect(state().replyIds.r).toEqual(["r2"]);
    expect(state().posts.r.commentsCount).toBe(1);
    expect(state().posts.r1a).toBeUndefined();
    expect(snapshot).toMatchObject({ parentId: "r", replyIndex: 1, parentDecremented: true });
  });

  it("removes a buffered post from incoming", () => {
    actions().bufferIncoming(makePost("n1"));
    actions().bufferIncoming(makePost("n2"));
    actions().consumeIncoming("forYou", ["n1"]);

    const snapshot = actions().removePost("n1");

    expect(state().incoming).toEqual(["n2"]);
    expect(state().consumedIncoming.forYou.n1).toBeUndefined();
    expect(snapshot).toMatchObject({ incomingIndex: 1, consumedTabs: ["forYou"] });
  });

  it("returns null and changes nothing for an unknown id", () => {
    const before = state();
    expect(actions().removePost("nope")).toBeNull();
    expect(state()).toBe(before);
  });
});

describe("markDeleted", () => {
  it("tombstones uncached ids and removes cached remnants, idempotently", () => {
    seedThread();

    actions().markDeleted(["uncached", "r1a"]);
    const once = state();
    actions().markDeleted(["uncached", "r1a"]);

    expect(state()).toBe(once);
    expect(state().deletedIds).toMatchObject({ uncached: true, r1a: true });
    expect(state().posts.r1a).toBeUndefined();
    expect(state().replyIds.r1).toEqual([]);
  });

  it("blocks a later upsert / buffer of a deleted id", () => {
    actions().markDeleted(["x-uncached"]);

    actions().upsertPosts([makePost("x-uncached")]);
    actions().bufferIncoming(makePost("x-uncached"));

    expect(state().posts["x-uncached"]).toBeUndefined();
    expect(state().incoming).toEqual([]);
  });
});

describe("restorePosts", () => {
  it("is the exact inverse of removePost", () => {
    seedThread();
    actions().bufferIncoming(makePost("n1"));
    const before = state();

    const snapshot = actions().removePost("r1")!;
    actions().restorePosts(snapshot);

    expect(state().posts).toEqual(before.posts);
    expect(state().replyIds).toEqual(before.replyIds);
    expect(state().feedIds).toEqual(before.feedIds);
    expect(state().incoming).toEqual(before.incoming);
    expect(state().deletedIds).toEqual({});
  });

  it("restores feed & incoming positions of a root", () => {
    seedThread();
    actions().bufferIncoming(makePost("n1"));
    actions().bufferIncoming(makePost("n2"));
    actions().consumeIncoming("following", ["n1"]);

    const snapshot = actions().removePost("n1")!;
    actions().restorePosts(snapshot);

    expect(state().incoming).toEqual(["n2", "n1"]);
    expect(state().consumedIncoming.following.n1).toBe(true);
  });

  it("restorePosts twice = once", () => {
    seedThread();
    const snapshot = actions().removePost("r1")!;

    actions().restorePosts(snapshot);
    const once = state();
    actions().restorePosts(snapshot);

    expect(state().replyIds.r).toEqual(["r2", "r1"]);
    expect(state().posts.r.commentsCount).toBe(2);
    expect(state().feedIds).toEqual(once.feedIds);
    expect(state().deletedIds.r1).toBeUndefined();
  });

  it("removes restored ids from tombstones", () => {
    seedThread();
    const snapshot = actions().removePost("r")!;

    actions().restorePosts(snapshot);

    const { result } = renderHook(() => useIsDeleted("r1a"));
    expect(result.current).toBe(false);
    expect(state().feedIds).toEqual({ forYou: ["x", "r"], following: ["r"] });
  });
});
// #endregion

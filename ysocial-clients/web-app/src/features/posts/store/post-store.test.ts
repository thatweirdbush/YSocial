import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { FeedTab, PostItem } from "../types";
import { getPendingFeed } from "../utils/pending-feed";
import {
  INCOMING_CAP,
  resetPostStore,
  useIsAuthorBlocked,
  useIsDeleted,
  useOwnerOp,
  usePinnedPostId,
  usePostStore,
  useReplyIds,
} from "./post-store";

const makePost = (id: string, overrides: Partial<PostItem> = {}): PostItem => ({
  id,
  kind: "post",
  rootPostId: id,
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

// #region Owner ops
describe("owner-op locks", () => {
  it("allows one pending op per post", () => {
    expect(actions().beginOwnerOp("p", "edit")).toBe(true);
    expect(actions().beginOwnerOp("p", "pin")).toBe(false);
    expect(actions().beginOwnerOp("q", "pin")).toBe(true);

    const { result } = renderHook(() => useOwnerOp("p"));
    expect(result.current).toBe("edit");

    actions().endOwnerOp("p");
    expect(state().ownerOpById.p).toBeUndefined();
    expect(actions().beginOwnerOp("p", "pin")).toBe(true);
  });
});

describe("editPost & setHideLikeCount", () => {
  it("edits content and marks the post edited", () => {
    actions().upsertPosts([makePost("p")]);

    actions().editPost("p", "mới");

    expect(state().posts.p).toMatchObject({ content: "mới", isEdited: true });
  });

  it("toggles the hidden like count flag", () => {
    actions().upsertPosts([makePost("p")]);

    actions().setHideLikeCount("p", true);
    expect(state().posts.p.hideLikeCount).toBe(true);
    actions().setHideLikeCount("p", false);
    expect(state().posts.p.hideLikeCount).toBe(false);
  });
});

describe("patchPostIf", () => {
  it("applies the patch when expected fields still match", () => {
    actions().upsertPosts([makePost("p", { content: "B", isEdited: true })]);

    actions().patchPostIf("p", { content: "B" }, { content: "A", isEdited: false });

    expect(state().posts.p).toMatchObject({ content: "A", isEdited: false });
  });

  it("edit rollback keeps concurrent hideLikeCount", () => {
    actions().upsertPosts([makePost("p", { content: "B", isEdited: true })]);
    actions().setHideLikeCount("p", true);

    actions().patchPostIf("p", { content: "B" }, { content: "A", isEdited: false });

    expect(state().posts.p).toMatchObject({ content: "A", hideLikeCount: true });
  });

  it("does nothing when any expected field changed", () => {
    actions().upsertPosts([makePost("p", { content: "C" })]);
    const before = state();

    actions().patchPostIf("p", { content: "B" }, { content: "A" });

    expect(state()).toBe(before);
  });
});

describe("usePinnedPostId", () => {
  const demo = { id: "1", displayName: "YSocial Member", username: "ysocial_member" };

  it("follows the author's pinned post as it is cached and re-pinned", () => {
    actions().upsertPosts([
      makePost("post-demo-01", { user: demo, isPinned: true }),
      makePost("post-demo-04", { user: demo }),
    ]);
    const { result } = renderHook(() => usePinnedPostId("1"));
    expect(result.current).toBe("post-demo-01");

    act(() => {
      actions().setPinned("post-demo-04", true);
    });
    expect(result.current).toBe("post-demo-04");
  });

  it("is undefined for an author without a pin", () => {
    const { result } = renderHook(() => usePinnedPostId("nobody"));
    expect(result.current).toBeUndefined();
  });
});

describe("pin index", () => {
  const pinIndex = () => state().pinnedIdByAuthor;

  beforeEach(() => {
    actions().upsertPosts([makePost("A"), makePost("B"), makePost("C"), makePost("other", { user: alice })]);
  });

  it("pinning a post unpins the author's previous pin", () => {
    expect(actions().setPinned("A", true)).toBeUndefined();
    expect(pinIndex()).toEqual({ u1: "A" });

    expect(actions().setPinned("B", true)).toBe("A");
    expect(state().posts.A.isPinned).toBe(false);
    expect(state().posts.B.isPinned).toBe(true);
    expect(pinIndex()).toEqual({ u1: "B" });
  });

  it("keeps pins of different authors apart", () => {
    actions().setPinned("A", true);
    actions().setPinned("other", true);

    expect(pinIndex()).toEqual({ u1: "A", a1: "other" });
  });

  it("unpin clears the index entry", () => {
    actions().setPinned("B", true);
    actions().setPinned("B", false);

    expect(pinIndex()).toEqual({});
    expect(state().posts.B.isPinned).toBe(false);
  });

  it("upsertPosts reindexes from server data", () => {
    actions().setPinned("B", true);

    actions().upsertPosts([makePost("C", { isPinned: true })]);
    expect(pinIndex()).toEqual({ u1: "C" });
    expect(state().posts.B.isPinned).toBe(false);

    actions().upsertPosts([makePost("C", { isPinned: false })]);
    expect(pinIndex()).toEqual({});
  });

  it("removePost of the pinned post clears the index, restorePosts brings it back", () => {
    actions().setPinned("A", true);

    const snapshot = actions().removePost("A")!;
    expect(pinIndex()).toEqual({});
    expect(snapshot.wasPinned).toBe(true);

    actions().restorePosts(snapshot);
    expect(pinIndex()).toEqual({ u1: "A" });
  });

  it("restorePosts keeps a pin the author made meanwhile; the restored post comes back unpinned", () => {
    actions().setPinned("A", true);
    const snapshot = actions().removePost("A")!;
    actions().setPinned("B", true);

    actions().restorePosts(snapshot);

    expect(pinIndex()).toEqual({ u1: "B" });
    expect(state().posts.B.isPinned).toBe(true);
    expect(state().posts.A.isPinned).toBe(false);
  });

  it("markDeleted clears the index of a pinned id and never points at a tombstone", () => {
    actions().setPinned("A", true);
    actions().setPinned("other", true);

    actions().markDeleted(["A"]);

    expect(pinIndex()).toEqual({ a1: "other" });
    expect(Object.values(pinIndex()).some((id) => state().deletedIds[id])).toBe(false);
  });

  it("markDeleted of a non-pinned id keeps the author's pin", () => {
    actions().setPinned("A", true);

    actions().markDeleted(["B"]);

    expect(pinIndex()).toEqual({ u1: "A" });
  });
});
// #endregion

// #region Author exclusion
describe("author exclusion", () => {
  const byAuthor = (id: string, authorId: string, overrides: Partial<PostItem> = {}) =>
    makePost(id, { user: { id: authorId, displayName: authorId, username: authorId }, ...overrides });

  function seedFeeds() {
    const posts = [byAuthor("a1", "a"), byAuthor("b1", "b"), byAuthor("a2", "a")];
    actions().upsertPosts(posts);
    actions().setFeedPage("forYou", ["a1", "b1", "a2"], false);
    actions().setFeedPage("following", ["a1", "b1"], false);
    actions().bufferIncoming(byAuthor("na", "a"));
    actions().bufferIncoming(byAuthor("nb", "b"));
  }

  it("muting removes the author from both feeds and the incoming buffer but keeps replies", () => {
    seedFeeds();
    actions().upsertPosts([byAuthor("r1", "a", { parentId: "b1" })]);
    actions().setReplies("b1", ["r1"]);

    actions().excludeAuthor("a", "muted");

    expect(state().feedIds.forYou).toEqual(["b1"]);
    expect(state().feedIds.following).toEqual(["b1"]);
    expect(state().incoming).toEqual(["nb"]);
    expect(state().replyIds.b1).toEqual(["r1"]);
    expect(state().excludedAuthors).toEqual({ a: { muted: true } });
    expect(state().posts.a1).toBeDefined();
  });

  it("blocking also removes the author's replies", () => {
    seedFeeds();
    actions().upsertPosts([byAuthor("r1", "a", { parentId: "b1" }), byAuthor("r2", "b", { parentId: "b1" })]);
    actions().setReplies("b1", ["r1", "r2"]);

    actions().excludeAuthor("a", "blocked");

    expect(state().replyIds.b1).toEqual(["r2"]);
    expect(state().feedIds.forYou).toEqual(["b1"]);
  });

  it("keeps an author excluded when only one of two overlapping reasons is lifted", () => {
    seedFeeds();
    actions().excludeAuthor("a", "muted");
    actions().excludeAuthor("a", "blocked");

    actions().includeAuthor("a", "blocked");

    expect(state().excludedAuthors).toEqual({ a: { muted: true } });
    actions().bufferIncoming(byAuthor("na2", "a"));
    expect(state().incoming).not.toContain("na2");
  });

  it("drops the entry once every reason is lifted and never restores removed ids", () => {
    seedFeeds();
    actions().excludeAuthor("a", "blocked");

    actions().includeAuthor("a", "blocked");

    expect(state().excludedAuthors).toEqual({});
    expect(state().feedIds.forYou).toEqual(["b1"]);
    expect(state().incoming).toEqual(["nb"]);
  });

  it("clears the author's consumed and dropped markers", () => {
    seedFeeds();
    actions().consumeIncoming("forYou", ["na"]);

    actions().excludeAuthor("a", "muted");

    expect(state().consumedIncoming.forYou).toEqual({});
  });

  it("skips excluded authors in the buffer and in feed pages", () => {
    actions().excludeAuthor("a", "muted");
    actions().upsertPosts([byAuthor("a1", "a"), byAuthor("b1", "b")]);

    actions().bufferIncoming(byAuthor("na", "a"));
    actions().setFeedPage("forYou", ["a1", "b1"], false);

    expect(state().incoming).toEqual([]);
    expect(state().feedIds.forYou).toEqual(["b1"]);
  });

  it("skips blocked authors in reply lists but not muted ones", () => {
    actions().upsertPosts([byAuthor("rm", "m", { parentId: "p" }), byAuthor("rb", "x", { parentId: "p" })]);
    actions().excludeAuthor("m", "muted");
    actions().excludeAuthor("x", "blocked");

    actions().setReplies("p", ["rm", "rb"]);

    expect(state().replyIds.p).toEqual(["rm"]);
  });

  it("skips a post by an author who blocked the viewer once the exclusion map is set", () => {
    actions().setExcludedAuthors({ a: { blocked: true } });

    actions().bufferIncoming(byAuthor("na", "a"));

    expect(state().incoming).toEqual([]);
  });

  it("setExcludedAuthors replaces the map and purges what it now excludes", () => {
    seedFeeds();
    usePostStore.setState({ excludedAuthors: { b: { muted: true } } });

    actions().setExcludedAuthors({ a: { blocked: true } });

    expect(state().excludedAuthors).toEqual({ a: { blocked: true } });
    expect(state().feedIds.forYou).toEqual(["b1"]);
    expect(state().incoming).toEqual(["nb"]);
  });

  it("resetViewerFeeds clears the viewer-dependent state but keeps cached posts", () => {
    seedFeeds();
    actions().excludeAuthor("a", "muted");

    actions().resetViewerFeeds();

    expect(state().feedIds).toEqual({ forYou: [], following: [] });
    expect(state().feedMeta.forYou.loaded).toBe(false);
    expect(state().incoming).toEqual([]);
    expect(state().consumedIncoming).toEqual({ forYou: {}, following: {} });
    expect(state().droppedAuthorIds).toEqual({ forYou: [], following: [] });
    expect(state().excludedAuthors).toEqual({});
    expect(state().posts.b1).toBeDefined();
  });

  it("resetViewerFlags clears the viewer's like & bookmark flags on every cached post and touches nothing else", () => {
    seedFeeds();
    const flagged = { ...state().posts.b1, isLikedByCurrentUser: true, isBookmarkedByCurrentUser: true, likesCount: 7 };
    usePostStore.setState((current) => ({ posts: { ...current.posts, b1: flagged } }));

    actions().resetViewerFlags();

    const { b1 } = state().posts;
    expect(b1.isLikedByCurrentUser).toBe(false);
    expect(b1.isBookmarkedByCurrentUser).toBe(false);
    expect({ ...b1, isLikedByCurrentUser: true, isBookmarkedByCurrentUser: true }).toEqual(flagged);
    expect(state().feedIds).toEqual(usePostStore.getState().feedIds);
    expect(Object.values(state().posts).every((post) => !post.isLikedByCurrentUser && !post.isBookmarkedByCurrentUser)).toBe(true);
  });

  it("useIsAuthorBlocked reflects only the blocked reason", () => {
    const { result } = renderHook(() => useIsAuthorBlocked("a"));
    expect(result.current).toBe(false);

    act(() => actions().excludeAuthor("a", "muted"));
    expect(result.current).toBe(false);

    act(() => actions().excludeAuthor("a", "blocked"));
    expect(result.current).toBe(true);
  });
});
// #endregion

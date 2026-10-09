import { describe, expect, it } from "vitest";
import { SEED_AUTHORS, SEED_FOLLOWED_AUTHOR_IDS } from "@/mocks/seed-authors";
import { getMockTagStat, MOCK_POSTS } from "./mock-posts";

const roots = MOCK_POSTS.filter((p) => p.parentId === undefined);
const childrenOf = (id: string) => MOCK_POSTS.filter((p) => p.parentId === id);

describe("mock dataset", () => {
  it("has 12 base root posts (post-001..post-012), 3 close friends roots and 4 demo-account roots", () => {
    const base = Array.from({ length: 12 }, (_, i) => `post-${String(i + 1).padStart(3, "0")}`);
    const closeFriends = Array.from({ length: 3 }, (_, i) => `post-cf-${String(i + 1).padStart(2, "0")}`);
    const demo = Array.from({ length: 4 }, (_, i) => `post-demo-${String(i + 1).padStart(2, "0")}`);
    expect(roots.map((p) => p.id).sort()).toEqual([...base, ...closeFriends, ...demo].sort());
  });

  it("marks exactly the close friends roots with the closeFriends visibility", () => {
    expect(
      MOCK_POSTS.filter((p) => p.visibility === "closeFriends")
        .map((p) => p.id)
        .sort(),
    ).toEqual(["post-cf-01", "post-cf-02", "post-cf-03"]);
  });

  it("gives the demo account one pinned root, one multi-image root and two replies", () => {
    const demoPosts = MOCK_POSTS.filter((p) => p.user.id === "1");
    expect(demoPosts.filter((p) => p.isPinned)).toHaveLength(1);
    expect(demoPosts.filter((p) => (p.imageUrls?.length ?? 0) > 1)).toHaveLength(1);
    expect(demoPosts.filter((p) => p.parentId !== undefined)).toHaveLength(2);
  });

  it("links every reply to an existing post", () => {
    const ids = new Set(MOCK_POSTS.map((p) => p.id));
    for (const reply of MOCK_POSTS.filter((p) => p.parentId !== undefined)) {
      expect(ids.has(reply.parentId!)).toBe(true);
    }
  });

  it("keeps commentsCount equal to the direct reply count", () => {
    for (const post of MOCK_POSTS) {
      expect(post.commentsCount, post.id).toBe(childrenOf(post.id).length);
    }
  });

  it("gives post-001 at least 4 replies, one of them with exactly 3 children", () => {
    const replies = childrenOf("post-001");
    expect(replies.length).toBeGreaterThanOrEqual(4);
    expect(replies.some((r) => childrenOf(r.id).length === 3)).toBe(true);
  });

  it("uses unique ids", () => {
    expect(new Set(MOCK_POSTS.map((p) => p.id)).size).toBe(MOCK_POSTS.length);
  });

  it("uses 8 authors and follows 3 of them", () => {
    const authorIds = new Set(SEED_AUTHORS.map((a) => a.id));
    expect(SEED_AUTHORS).toHaveLength(8);
    expect(SEED_FOLLOWED_AUTHOR_IDS).toHaveLength(3);
    expect(SEED_FOLLOWED_AUTHOR_IDS.every((id) => authorIds.has(id))).toBe(true);
  });

  it("looks up seed hashtag stats case & diacritics insensitive", () => {
    expect(getMockTagStat("nextjs")).toEqual({ tag: "NextJS", postsCount: 3 });
    expect(getMockTagStat("DALAT")?.postsCount).toBe(2);
    expect(getMockTagStat("nope")).toBeUndefined();
  });
});

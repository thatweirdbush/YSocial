import { describe, expect, it } from "vitest";
import { MOCK_AUTHORS, MOCK_FOLLOWED_AUTHOR_IDS } from "./mock-authors";
import { getMockTagStat, MOCK_POSTS } from "./mock-posts";

const roots = MOCK_POSTS.filter((p) => p.parentId === undefined);
const childrenOf = (id: string) => MOCK_POSTS.filter((p) => p.parentId === id);

describe("mock dataset", () => {
  it("has 12 root posts with ids post-001..post-012", () => {
    const expected = Array.from({ length: 12 }, (_, i) => `post-${String(i + 1).padStart(3, "0")}`);
    expect(roots.map((p) => p.id).sort()).toEqual(expected);
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
    const authorIds = new Set(MOCK_AUTHORS.map((a) => a.id));
    expect(MOCK_AUTHORS).toHaveLength(8);
    expect(MOCK_FOLLOWED_AUTHOR_IDS).toHaveLength(3);
    expect(MOCK_FOLLOWED_AUTHOR_IDS.every((id) => authorIds.has(id))).toBe(true);
  });

  it("looks up seed hashtag stats case & diacritics insensitive", () => {
    expect(getMockTagStat("nextjs")).toEqual({ tag: "NextJS", postsCount: 3 });
    expect(getMockTagStat("DALAT")?.postsCount).toBe(2);
    expect(getMockTagStat("nope")).toBeUndefined();
  });
});

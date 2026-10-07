import { beforeEach, describe, expect, it } from "vitest";
import { __resetFollowGraph, getFollowedAuthorIds, setFollowed } from "./follow-graph";
import { SEED_FOLLOWED_AUTHOR_IDS } from "./seed-authors";

const sorted = (ids: Iterable<string>) => [...ids].sort();

beforeEach(() => {
  __resetFollowGraph();
});

describe("follow-graph", () => {
  it("seeds an unknown viewer from the seed follow list", () => {
    expect(sorted(getFollowedAuthorIds("v1"))).toEqual(sorted(SEED_FOLLOWED_AUTHOR_IDS));
  });

  it("keeps follow state per viewer", () => {
    setFollowed("v1", "author-01", true);

    expect(getFollowedAuthorIds("v1").has("author-01")).toBe(true);
    expect(getFollowedAuthorIds("v2").has("author-01")).toBe(false);
  });

  it("unfollows", () => {
    setFollowed("v1", "author-02", false);

    expect(getFollowedAuthorIds("v1").has("author-02")).toBe(false);
  });

  it("ignores self-follow", () => {
    setFollowed("author-01", "author-01", true);

    expect(getFollowedAuthorIds("author-01").has("author-01")).toBe(false);
  });

  it("returns a copy that cannot mutate the graph", () => {
    const ids = getFollowedAuthorIds("v1") as Set<string>;
    ids.add("author-08");

    expect(getFollowedAuthorIds("v1").has("author-08")).toBe(false);
  });

  it("resets every viewer back to the seed", () => {
    setFollowed("v1", "author-01", true);
    __resetFollowGraph();

    expect(sorted(getFollowedAuthorIds("v1"))).toEqual(sorted(SEED_FOLLOWED_AUTHOR_IDS));
  });
});

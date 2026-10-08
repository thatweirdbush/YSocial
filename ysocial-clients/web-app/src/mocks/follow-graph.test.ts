import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetFollowGraph,
  getFollowedAuthorIds,
  getFollowerCount,
  getFollowerIds,
  getFollowingCount,
  setFollowed,
} from "./follow-graph";
import { SEED_FOLLOWED_AUTHOR_IDS } from "./seed-authors";
import { SEED_FAN_FOLLOWS, SEED_FANS } from "./seed-fans";

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
    expect(getFollowerIds("author-01").has("author-01")).toBe(false);
  });

  it("returns copies that cannot mutate the graph", () => {
    const ids = getFollowedAuthorIds("v1") as Set<string>;
    ids.add("author-08");
    const followers = getFollowerIds("author-01") as Set<string>;
    followers.add("intruder");

    expect(getFollowedAuthorIds("v1").has("author-08")).toBe(false);
    expect(getFollowerIds("author-01").has("intruder")).toBe(false);
  });

  it("resets every viewer back to the seed", () => {
    const before = getFollowerCount("author-01");
    setFollowed("v1", "author-01", true);
    __resetFollowGraph();

    expect(sorted(getFollowedAuthorIds("v1"))).toEqual(sorted(SEED_FOLLOWED_AUTHOR_IDS));
    expect(getFollowerCount("author-01")).toBe(before);
  });

  it("makes every fan of a base user one of its followers", () => {
    const followers = getFollowerIds("author-01");
    for (const fanId of SEED_FAN_FOLLOWS["author-01"]) {
      expect(followers.has(fanId)).toBe(true);
    }
  });

  it("makes fans follow only their base user and have no followers of their own", () => {
    const fan = SEED_FANS[0];
    const baseId = Object.keys(SEED_FAN_FOLLOWS).find((id) => SEED_FAN_FOLLOWS[id].includes(fan.id));

    expect(baseId).toBeDefined();
    expect(sorted(getFollowedAuthorIds(fan.id))).toEqual([baseId]);
    expect(getFollowerCount(fan.id)).toBe(0);
  });

  it("keeps the reverse index consistent after follow and unfollow", () => {
    const before = getFollowerCount("author-01");

    setFollowed("me", "author-01", true);
    expect(getFollowerIds("author-01").has("me")).toBe(true);
    expect(getFollowerCount("author-01")).toBe(before + 1);

    setFollowed("me", "author-01", false);
    expect(getFollowerIds("author-01").has("me")).toBe(false);
    expect(getFollowerCount("author-01")).toBe(before);
  });

  it("reports counts equal to the set sizes", () => {
    setFollowed("me", "author-05", true);

    expect(getFollowingCount("me")).toBe(getFollowedAuthorIds("me").size);
    expect(getFollowerCount("author-05")).toBe(getFollowerIds("author-05").size);
  });

  it("is idempotent when following twice", () => {
    const before = getFollowerCount("author-04");

    setFollowed("v1", "author-04", true);
    setFollowed("v1", "author-04", true);

    expect(getFollowerCount("author-04")).toBe(before + 1);
  });

  it("materializes an unknown follower on first access so counts do not jump later", () => {
    expect(getFollowingCount("v1")).toBe(SEED_FOLLOWED_AUTHOR_IDS.length);
    expect(getFollowerIds("author-02").has("v1")).toBe(true);
  });
});

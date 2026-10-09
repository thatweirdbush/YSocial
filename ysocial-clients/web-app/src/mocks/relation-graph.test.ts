import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetRelationGraph,
  acceptAllRequests,
  getCloseFriendIds,
  getEdge,
  getFollowedIds,
  getFollowerCount,
  getFollowerIds,
  getFollowingCount,
  getFollowStatus,
  getMutedIds,
  getRequestIds,
  removeFollow,
  requestFollow,
  setCloseFriend,
  setMutedEdge,
} from "./relation-graph";
import { SEED_FOLLOWED_AUTHOR_IDS } from "./seed-authors";
import { SEED_FAN_FOLLOWS, SEED_FANS } from "./seed-fans";

const sorted = (ids: Iterable<string>) => [...ids].sort();

beforeEach(() => {
  __resetRelationGraph();
});

describe("relation-graph follows", () => {
  it("seeds an unknown viewer from the seed follow list", () => {
    expect(sorted(getFollowedIds("v1"))).toEqual(sorted(SEED_FOLLOWED_AUTHOR_IDS));
  });

  it("keeps follow state per viewer", () => {
    requestFollow("v1", "author-01", false);

    expect(getFollowedIds("v1").has("author-01")).toBe(true);
    expect(getFollowedIds("v2").has("author-01")).toBe(false);
  });

  it("unfollows", () => {
    removeFollow("v1", "author-02");

    expect(getFollowedIds("v1").has("author-02")).toBe(false);
  });

  it("ignores self-follow", () => {
    requestFollow("author-01", "author-01", false);

    expect(getFollowedIds("author-01").has("author-01")).toBe(false);
    expect(getFollowerIds("author-01").has("author-01")).toBe(false);
  });

  it("returns copies that cannot mutate the graph", () => {
    const ids = getFollowedIds("v1") as Set<string>;
    ids.add("author-08");
    const followers = getFollowerIds("author-01") as Set<string>;
    followers.add("intruder");

    expect(getFollowedIds("v1").has("author-08")).toBe(false);
    expect(getFollowerIds("author-01").has("intruder")).toBe(false);
  });

  it("resets every viewer back to the seed", () => {
    const before = getFollowerCount("author-01");
    requestFollow("v1", "author-01", false);
    __resetRelationGraph();

    expect(sorted(getFollowedIds("v1"))).toEqual(sorted(SEED_FOLLOWED_AUTHOR_IDS));
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
    expect(sorted(getFollowedIds(fan.id))).toEqual([baseId]);
    expect(getFollowerCount(fan.id)).toBe(0);
  });

  it("keeps the reverse index consistent after follow and unfollow", () => {
    const before = getFollowerCount("author-01");

    requestFollow("me", "author-01", false);
    expect(getFollowerIds("author-01").has("me")).toBe(true);
    expect(getFollowerCount("author-01")).toBe(before + 1);

    removeFollow("me", "author-01");
    expect(getFollowerIds("author-01").has("me")).toBe(false);
    expect(getFollowerCount("author-01")).toBe(before);
  });

  it("reports counts equal to the set sizes", () => {
    requestFollow("me", "author-05", false);

    expect(getFollowingCount("me")).toBe(getFollowedIds("me").size);
    expect(getFollowerCount("author-05")).toBe(getFollowerIds("author-05").size);
  });

  it("is idempotent when following twice", () => {
    const before = getFollowerCount("author-04");

    requestFollow("v1", "author-04", false);
    requestFollow("v1", "author-04", false);

    expect(getFollowerCount("author-04")).toBe(before + 1);
  });

  it("materializes an unknown follower on first access so counts do not jump later", () => {
    expect(getFollowingCount("v1")).toBe(SEED_FOLLOWED_AUTHOR_IDS.length);
    expect(getFollowerIds("author-02").has("v1")).toBe(true);
  });
});

describe("relation-graph follow status", () => {
  it("accepts immediately when the target is public", () => {
    const before = getFollowerCount("author-04");

    expect(requestFollow("a", "author-04", false)).toBe("accepted");
    expect(getFollowerCount("author-04")).toBe(before + 1);
  });

  it("keeps a request pending when the target is private", () => {
    const before = getFollowerCount("author-07");

    expect(requestFollow("a", "author-07", true)).toBe("pending");
    expect(getFollowerCount("author-07")).toBe(before);
    expect(getRequestIds("author-07")).toContain("a");
    expect(getFollowStatus("a", "author-07")).toBe("pending");
  });

  it("does not change an existing request or follow when requested again", () => {
    requestFollow("a", "author-07", true);
    const before = getRequestIds("author-07");

    expect(requestFollow("a", "author-07", false)).toBe("pending");
    expect(getRequestIds("author-07")).toEqual(before);
  });

  it("clears a pending request on unfollow", () => {
    requestFollow("a", "author-07", true);
    removeFollow("a", "author-07");

    expect(getFollowStatus("a", "author-07")).toBe("none");
    expect(getRequestIds("author-07")).not.toContain("a");
  });

  it("never returns an undefined edge", () => {
    expect(getEdge("a", "author-01")).toEqual({ status: "none", isCloseFriend: false, isMuted: false });
  });

  it("lists requests newest first", () => {
    requestFollow("a", "author-07", true);
    requestFollow("b", "author-07", true);

    expect(getRequestIds("author-07").slice(0, 2)).toEqual(["b", "a"]);
  });
});

describe("relation-graph close friends & mute", () => {
  it("rejects a close friend that is not an accepted follow", () => {
    requestFollow("a", "author-07", true);

    expect(() => setCloseFriend("a", "author-07", true)).toThrow("Close friend requires accepted follow");
  });

  it("keeps the flag dormant after unfollow and reactivates it on re-follow", () => {
    requestFollow("a", "author-04", false);
    setCloseFriend("a", "author-04", true);
    removeFollow("a", "author-04");

    expect(getCloseFriendIds("a")).not.toContain("author-04");
    expect(getEdge("a", "author-04").isCloseFriend).toBe(true);

    requestFollow("a", "author-04", false);
    expect(getCloseFriendIds("a")).toContain("author-04");
  });

  it("keeps a mute on a target that is not followed", () => {
    setMutedEdge("a", "author-04", true);

    expect(getMutedIds("a")).toEqual(["author-04"]);
    expect(getFollowStatus("a", "author-04")).toBe("none");
    setMutedEdge("a", "author-04", false);
    expect(getMutedIds("a")).toEqual([]);
  });
});

describe("relation-graph bulk accept", () => {
  it("accepts every pending request and updates counts", () => {
    requestFollow("a", "author-07", true);
    requestFollow("b", "author-07", true);
    requestFollow("c", "author-07", true);
    const requests = getRequestIds("author-07").length;
    const before = getFollowerCount("author-07");

    expect(acceptAllRequests("author-07")).toBe(requests);
    expect(getFollowerCount("author-07")).toBe(before + requests);
    expect(getRequestIds("author-07")).toEqual([]);
  });
});

describe("relation-graph seed", () => {
  it("seeds the demo account pending request and incoming requests", () => {
    expect(getFollowStatus("1", "author-05")).toBe("pending");
    expect(getRequestIds("1")).toHaveLength(4);
    expect(getRequestIds("1")).toEqual(expect.arrayContaining(["author-02", "author-08"]));
  });

  it("seeds author-03 following the demo and marking it a close friend", () => {
    expect(getFollowStatus("author-03", "1")).toBe("accepted");
    expect(getCloseFriendIds("author-03")).toEqual(["1"]);
    expect(getCloseFriendIds("1")).toEqual(["author-03"]);
  });
});

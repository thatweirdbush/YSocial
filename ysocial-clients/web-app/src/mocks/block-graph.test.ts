import { beforeEach, describe, expect, it } from "vitest";
import { __resetBlockGraph, getBlockedIds, isBlocked, isEitherBlocked, setBlocked } from "./block-graph";
import {
  __resetRelationGraph,
  getEdge,
  getFollowerCount,
  getFollowStatus,
  getRequestIds,
  requestFollow,
  setMutedEdge,
} from "./relation-graph";

beforeEach(() => {
  __resetRelationGraph();
  __resetBlockGraph();
});

describe("block-graph", () => {
  it("purges follows in both directions and keeps the close friend flag dormant", () => {
    setBlocked("1", "author-03", true);

    expect(getFollowStatus("1", "author-03")).toBe("none");
    expect(getFollowStatus("author-03", "1")).toBe("none");
    expect(getEdge("1", "author-03").isCloseFriend).toBe(true);
    expect(getEdge("author-03", "1").isCloseFriend).toBe(true);
    expect(isBlocked("1", "author-03")).toBe(true);
    expect(isBlocked("author-03", "1")).toBe(false);
    expect(isEitherBlocked("author-03", "1")).toBe(true);
  });

  it("updates follower counts when it purges follows", () => {
    const before = getFollowerCount("author-03");

    setBlocked("1", "author-03", true);

    expect(getFollowerCount("author-03")).toBe(before - 1);
  });

  it("clears pending requests in both directions", () => {
    setBlocked("1", "author-02", true);
    expect(getRequestIds("1")).not.toContain("author-02");

    requestFollow("author-07", "author-05", true);
    setBlocked("author-05", "author-07", true);
    expect(getRequestIds("author-05")).not.toContain("author-07");
    expect(getFollowStatus("1", "author-05")).toBe("pending");

    setBlocked("1", "author-05", true);
    expect(getFollowStatus("1", "author-05")).toBe("none");
  });

  it("keeps the mute flag", () => {
    setMutedEdge("1", "author-03", true);

    setBlocked("1", "author-03", true);

    expect(getEdge("1", "author-03").isMuted).toBe(true);
  });

  it("ignores a self-block", () => {
    setBlocked("1", "1", true);

    expect(isBlocked("1", "1")).toBe(false);
    expect(getBlockedIds("1")).toEqual([]);
  });

  it("does not restore follows on unblock", () => {
    setBlocked("1", "author-03", true);
    setBlocked("1", "author-03", false);

    expect(isEitherBlocked("1", "author-03")).toBe(false);
    expect(getFollowStatus("1", "author-03")).toBe("none");
    expect(getFollowStatus("author-03", "1")).toBe("none");
  });

  it("lists blocked ids newest first", () => {
    setBlocked("1", "author-01", true);
    setBlocked("1", "author-02", true);

    expect(getBlockedIds("1")).toEqual(["author-02", "author-01"]);
  });

  it("restores an empty graph on reset", () => {
    setBlocked("1", "author-01", true);
    __resetBlockGraph();

    expect(getBlockedIds("1")).toEqual([]);
  });
});

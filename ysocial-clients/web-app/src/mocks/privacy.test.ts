import { beforeEach, describe, expect, it } from "vitest";
import { __resetPrivacy, isPrivate, setPrivate } from "./privacy";
import { __resetRelationGraph, getFollowerCount, getFollowStatus, getRequestIds } from "./relation-graph";

beforeEach(() => {
  __resetRelationGraph();
  __resetPrivacy();
});

describe("privacy", () => {
  it("seeds private accounts", () => {
    expect(isPrivate("author-07")).toBe(true);
    expect(isPrivate("author-05")).toBe(true);
    expect(isPrivate("1")).toBe(true);
    expect(isPrivate("author-01")).toBe(false);
    expect(isPrivate("unknown-user")).toBe(false);
  });

  it("accepts every pending request when going public and returns the count", () => {
    const followers = getFollowerCount("1");

    expect(setPrivate("1", false)).toBe(4);
    expect(isPrivate("1")).toBe(false);
    expect(getRequestIds("1")).toEqual([]);
    expect(getFollowerCount("1")).toBe(followers + 4);
    expect(getFollowStatus("author-02", "1")).toBe("accepted");
  });

  it("returns 0 and keeps requests when going private", () => {
    expect(setPrivate("author-01", true)).toBe(0);
    expect(isPrivate("author-01")).toBe(true);
  });

  it("returns 0 when going public with no pending requests", () => {
    setPrivate("1", false);

    expect(setPrivate("1", false)).toBe(0);
  });

  it("restores the seed on reset", () => {
    setPrivate("author-07", false);
    setPrivate("author-01", true);
    __resetPrivacy();

    expect(isPrivate("author-07")).toBe(true);
    expect(isPrivate("author-01")).toBe(false);
  });
});

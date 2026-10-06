import { describe, expect, it } from "vitest";
import { SEED_AUTHORS } from "@/mocks/seed-authors";
import type { PostItem } from "../types";
import { getVisibleLikeCount } from "./like-visibility";

const owner = SEED_AUTHORS[0];

const post = (hideLikeCount?: boolean): PostItem => ({
  id: "p1",
  content: "x",
  createdAt: new Date().toISOString(),
  likesCount: 7,
  commentsCount: 0,
  isLikedByCurrentUser: false,
  isBookmarkedByCurrentUser: false,
  user: owner,
  hideLikeCount,
});

describe("getVisibleLikeCount", () => {
  it("shows the count when not hidden", () => {
    expect(getVisibleLikeCount(post(), "someone")).toBe(7);
  });

  it("shows a hidden count to the owner", () => {
    expect(getVisibleLikeCount(post(true), owner.id)).toBe(7);
  });

  it("hides a hidden count from other viewers", () => {
    expect(getVisibleLikeCount(post(true), "someone")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { SEED_AUTHORS } from "@/mocks/seed-authors";
import type { PostItem } from "../types";
import { getPostFeedTabs } from "./feed-tabs";

const post = (authorIndex: number, parentId?: string): PostItem => ({
  id: "p1",
  kind: parentId ? "comment" : "post",
  rootPostId: parentId ?? "p1",
  content: "x",
  createdAt: new Date().toISOString(),
  likesCount: 0,
  commentsCount: 0,
  isLikedByCurrentUser: false,
  isBookmarkedByCurrentUser: false,
  user: SEED_AUTHORS[authorIndex],
  parentId,
});

const followed = new Set([SEED_AUTHORS[1].id]);

describe("getPostFeedTabs", () => {
  it("never puts replies in a feed", () => {
    expect(getPostFeedTabs(post(1, "root"), followed)).toEqual([]);
  });

  it("puts a followed author's root post in both tabs", () => {
    expect(getPostFeedTabs(post(1), followed)).toEqual(["forYou", "following"]);
  });

  it("puts other root posts in forYou only", () => {
    expect(getPostFeedTabs(post(0), followed)).toEqual(["forYou"]);
  });
});

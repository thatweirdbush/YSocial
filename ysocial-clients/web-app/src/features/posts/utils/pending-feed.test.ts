import { describe, expect, it } from "vitest";
import { SEED_AUTHORS } from "@/mocks/seed-authors";
import type { IncomingBuffer, PostItem } from "../types";
import { getPendingFeed } from "./pending-feed";

const [alice, bob, carol] = SEED_AUTHORS;

const post = (id: string, user = alice): PostItem => ({
  id,
  content: id,
  createdAt: new Date().toISOString(),
  likesCount: 0,
  commentsCount: 0,
  isLikedByCurrentUser: false,
  isBookmarkedByCurrentUser: false,
  user,
});

const posts: Record<string, PostItem> = {
  p1: post("p1", carol),
  p2: post("p2", bob),
  p3: post("p3", alice),
};

const buffer = (overrides: Partial<IncomingBuffer> = {}): IncomingBuffer => ({
  incoming: ["p3", "p2", "p1"],
  consumedIncoming: { forYou: {}, following: {} },
  droppedAuthorIds: { forYou: [], following: [] },
  ...overrides,
});

const followsBob = new Set([bob.id]);

describe("getPendingFeed", () => {
  it("returns every unconsumed post for forYou, newest first", () => {
    expect(getPendingFeed(posts, buffer(), "forYou", followsBob).ids).toEqual(["p3", "p2", "p1"]);
  });

  it("returns only followed authors for following", () => {
    expect(getPendingFeed(posts, buffer(), "following", followsBob).ids).toEqual(["p2"]);
  });

  it("excludes ids consumed by that tab only", () => {
    const consumed = buffer({ consumedIncoming: { forYou: { p3: true, p2: true }, following: {} } });

    expect(getPendingFeed(posts, consumed, "forYou", followsBob).ids).toEqual(["p1"]);
    expect(getPendingFeed(posts, consumed, "following", followsBob).ids).toEqual(["p2"]);
  });

  it("follow later -> becomes pending", () => {
    const consumed = buffer({ consumedIncoming: { forYou: { p1: true }, following: {} } });
    const followsBobAndCarol = new Set([bob.id, carol.id]);

    expect(getPendingFeed(posts, consumed, "following", followsBobAndCarol).ids).toEqual(["p2", "p1"]);
  });

  it("skips ids missing from the post cache", () => {
    expect(getPendingFeed(posts, buffer({ incoming: ["gone", "p1"] }), "forYou", followsBob).ids).toEqual(["p1"]);
  });

  it("reports forYou overflow whenever an author was dropped", () => {
    expect(getPendingFeed(posts, buffer(), "forYou", followsBob).overflow).toBe(false);
    const dropped = buffer({ droppedAuthorIds: { forYou: [alice.id], following: [] } });
    expect(getPendingFeed(posts, dropped, "forYou", followsBob).overflow).toBe(true);
  });

  it("reports following overflow only for followed dropped authors", () => {
    const dropped = buffer({ droppedAuthorIds: { forYou: [], following: [alice.id] } });

    expect(getPendingFeed(posts, dropped, "following", followsBob).overflow).toBe(false);
    expect(getPendingFeed(posts, dropped, "following", new Set([alice.id])).overflow).toBe(true);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { GUEST_ACTOR_ID } from "@/features/auth";
import type { PostVisibility } from "@/features/posts/types";
import { __resetBlockGraph, setBlocked } from "./block-graph";
import { __resetPrivacy } from "./privacy";
import { __resetRelationGraph, removeFollow, setMutedEdge } from "./relation-graph";
import { SEED_AUTHORS } from "./seed-authors";
import { asViewer, canDiscoverUser, canViewPost, canViewProfile, GUEST_ACTOR, isMarkedBy, isMutedBy } from "./visibility";

const author = (id: string) => {
  const found = SEED_AUTHORS.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Unknown author ${id}`);
  return found;
};
const post = (authorId: string, visibility?: PostVisibility) => ({ user: author(authorId), visibility });

beforeEach(() => {
  __resetRelationGraph();
  __resetBlockGraph();
  __resetPrivacy();
});

describe("asViewer", () => {
  it("normalizes the guest actor to null and keeps real ids", () => {
    expect(asViewer("me")).toBeNull();
    expect(asViewer("1")).toBe("1");
    expect(GUEST_ACTOR).toBe(GUEST_ACTOR_ID);
  });
});

describe("canViewPost", () => {
  const cases: Array<[string, string | null, string, PostVisibility | undefined, boolean]> = [
    ["guest + public post", null, "author-01", undefined, true],
    ["guest + private author", null, "author-07", undefined, false],
    ["guest + close friends post", null, "author-03", "closeFriends", false],
    ["viewer not accepted + private author", "1", "author-07", undefined, false],
    ["viewer marked close friend + CF post", "1", "author-03", "closeFriends", true],
    ["viewer not marked + CF post", "1", "author-02", "closeFriends", false],
    ["author sees own CF post", "author-02", "author-02", "closeFriends", true],
    ["author sees own private post", "author-07", "author-07", undefined, true],
    ["accepted follower + private author", "1", "author-05", undefined, false],
  ];

  it.each(cases)("%s", (_name, viewer, authorId, visibility, expected) => {
    expect(canViewPost(viewer, post(authorId, visibility))).toBe(expected);
  });

  it("hides a CF post once the author's flag is dormant (author unfollowed the viewer)", () => {
    removeFollow("author-03", "1");

    expect(isMarkedBy("author-03", "1")).toBe(false);
    expect(canViewPost("1", post("author-03", "closeFriends"))).toBe(false);
  });

  it("hides posts in both directions of a block", () => {
    setBlocked("1", "author-01", true);
    expect(canViewPost("1", post("author-01"))).toBe(false);
    expect(canDiscoverUser("1", "author-01")).toBe(false);

    __resetBlockGraph();
    setBlocked("author-01", "1", true);
    expect(canViewPost("1", post("author-01"))).toBe(false);
    expect(canDiscoverUser("1", "author-01")).toBe(false);
  });
});

describe("canDiscoverUser & canViewProfile", () => {
  it("keeps private accounts discoverable", () => {
    expect(canDiscoverUser("1", "author-07")).toBe(true);
    expect(canDiscoverUser(null, "author-07")).toBe(true);
  });

  it("locks a private profile for guests and non-accepted viewers only", () => {
    expect(canViewProfile(null, "author-07")).toBe(false);
    expect(canViewProfile("1", "author-07")).toBe(false);
    expect(canViewProfile("author-07", "author-07")).toBe(true);
    expect(canViewProfile("1", "author-01")).toBe(true);
    expect(canViewProfile(null, "author-01")).toBe(true);
  });

  it("does not fold a block into canViewProfile", () => {
    setBlocked("1", "author-01", true);

    expect(canViewProfile("1", "author-01")).toBe(true);
  });
});

describe("isMutedBy", () => {
  it("reflects the viewer's mute flag and is false for guests", () => {
    setMutedEdge("1", "author-02", true);

    expect(isMutedBy("1", "author-02")).toBe(true);
    expect(isMutedBy("1", "author-04")).toBe(false);
    expect(isMutedBy(null, "author-02")).toBe(false);
  });
});

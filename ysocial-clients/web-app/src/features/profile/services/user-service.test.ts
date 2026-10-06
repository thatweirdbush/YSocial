import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetFollowGraph, getFollowedAuthorIds } from "@/mocks/follow-graph";
import { SEED_FOLLOWED_AUTHOR_IDS } from "@/mocks/seed-authors";
import { __resetMockUsers, fetchFollowedIds, fetchSuggestedUsers, fetchUser, searchUsers, setFollow } from "./user-service";

async function settle<T>(promise: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return promise;
}

const usernames = async (query: string) => (await settle(searchUsers(query, "v1"))).map((user) => user.username);

beforeEach(() => {
  vi.useFakeTimers();
  __resetMockUsers();
  __resetFollowGraph();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("searchUsers", () => {
  it("matches every token over name, diacritics-insensitive", async () => {
    expect(await usernames("tran quoc")).toEqual(["anquoc.dev"]);
  });

  it("strips a leading @", async () => {
    expect(await usernames("@anquoc")).toEqual(["anquoc.dev"]);
  });

  it("matches the bio", async () => {
    expect(await usernames("da lat")).toEqual(["giahan.photo"]);
  });

  it("ranks username-prefix matches first, then by followers", async () => {
    const result = await usernames("n");
    expect(result.slice(0, 2)).toEqual(["namle.codes", "antigravity.core"]);
  });

  it("returns nothing for a blank query", async () => {
    expect(await usernames("  ")).toEqual([]);
  });
});

describe("fetchSuggestedUsers", () => {
  it("returns users not followed, most followed first", async () => {
    const users = await settle(fetchSuggestedUsers(3, "v1"));
    expect(users.map((user) => user.username)).toEqual(["antigravity.core", "minhthu.design", "baongoc.writes"]);
    expect(users.every((user) => !user.isFollowing)).toBe(true);
  });
});

describe("setFollow", () => {
  it("persists follow so a refetch keeps it (idempotent set)", async () => {
    await settle(setFollow("author-01", true, "v1"));
    await settle(setFollow("author-01", true, "v1"));

    const suggested = await settle(fetchSuggestedUsers(8, "v1"));
    expect(suggested.some((user) => user.id === "author-01")).toBe(false);
    const [user] = await settle(searchUsers("antigravity", "v1"));
    expect(user).toMatchObject({ isFollowing: true, followersCount: 48_201 });
  });

  it("follows per viewer while the follower count stays global", async () => {
    await settle(setFollow("author-01", true, "v1"));

    expect(await settle(fetchUser("author-01", "v1"))).toMatchObject({ isFollowing: true, followersCount: 48_201 });
    expect(await settle(fetchUser("author-01", "v2"))).toMatchObject({ isFollowing: false, followersCount: 48_201 });
    expect(getFollowedAuthorIds("v1").has("author-01")).toBe(true);
    expect(getFollowedAuthorIds("v2").has("author-01")).toBe(false);
  });
});

describe("fetchUser", () => {
  it("returns the profile with the viewer's follow flag", async () => {
    expect(await settle(fetchUser("author-01", "v1"))).toMatchObject({ username: "antigravity.core", isFollowing: false });
    expect(await settle(fetchUser("author-02", "v1"))).toMatchObject({ isFollowing: true });
  });

  it("returns null for an unknown id", async () => {
    expect(await settle(fetchUser("nope", "v1"))).toBeNull();
  });
});

describe("fetchFollowedIds", () => {
  it("returns the complete follow set of the viewer", async () => {
    expect((await settle(fetchFollowedIds("v1"))).sort()).toEqual([...SEED_FOLLOWED_AUTHOR_IDS].sort());

    await settle(setFollow("author-08", true, "v1"));
    expect(await settle(fetchFollowedIds("v1"))).toContain("author-08");
    expect(await settle(fetchFollowedIds("v2"))).not.toContain("author-08");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@/lib/errors";
import { normalizeText } from "@/lib/text";
import { __resetRelationGraph, getFollowedIds, getFollowerCount, getFollowingCount } from "@/mocks/relation-graph";
import { SEED_FOLLOWED_AUTHOR_IDS, SEED_FOLLOWING } from "@/mocks/seed-authors";
import { isFanId } from "@/mocks/seed-fans";
import { getSeedUserByUsername, HIDDEN_FOLLOWERS, HIDDEN_FOLLOWING, MOCK_USERS } from "../mocks/mock-users";
import {
  __resetMockUsers,
  FOLLOW_LIST_PAGE_SIZE,
  fetchFollowedIds,
  fetchFollowList,
  fetchSuggestedUsers,
  fetchUser,
  fetchUserByUsername,
  searchUsers,
  setFollow,
  updateProfile,
  upsertViewerUser,
} from "./user-service";

async function settle<T>(promise: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return promise;
}

const usernames = async (query: string) => (await settle(searchUsers(query, "v1"))).map((user) => user.username);

beforeEach(() => {
  vi.useFakeTimers();
  __resetMockUsers();
  __resetRelationGraph();
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
    expect(result[0]).toBe("namle.codes");
    const firstNonPrefix = result.findIndex((username) => !username.startsWith("n"));
    expect(result[firstNonPrefix]).toBe("antigravity.core");
    expect(result.slice(firstNonPrefix).some((username) => username.startsWith("n"))).toBe(false);
  });

  it("includes fans in results", async () => {
    expect((await usernames("ngan")).some((username) => username.startsWith("ngan."))).toBe(true);
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

  it("never returns fans or the actor", async () => {
    const users = await settle(fetchSuggestedUsers(500, "1"));
    expect(users.some((user) => isFanId(user.id))).toBe(false);
    expect(users.some((user) => user.id === "1")).toBe(false);
  });
});

describe("setFollow", () => {
  it("persists follow so a refetch keeps it (idempotent set)", async () => {
    await settle(setFollow("author-01", true, "v1"));
    await settle(setFollow("author-01", true, "v1"));

    const suggested = await settle(fetchSuggestedUsers(8, "v1"));
    expect(suggested.some((user) => user.id === "author-01")).toBe(false);
    const [user] = await settle(searchUsers("antigravity", "v1"));
    expect(user).toMatchObject({ isFollowing: true });
    expect(user.followersCount).toBe(HIDDEN_FOLLOWERS["author-01"] + getFollowerCount("author-01"));
  });

  it("follows per viewer while the follower count stays global", async () => {
    await settle(setFollow("author-01", true, "v1"));

    const forV1 = await settle(fetchUser("author-01", "v1"));
    const forV2 = await settle(fetchUser("author-01", "v2"));
    expect(forV1).toMatchObject({ isFollowing: true });
    expect(forV2).toMatchObject({ isFollowing: false });
    expect(getFollowedIds("v1").has("author-01")).toBe(true);
    expect(getFollowedIds("v2").has("author-01")).toBe(false);
  });

  it("derives counts from the graph: target followers +1 and actor following +1, nothing stored", async () => {
    const before = await settle(fetchUser("author-01", "v1"));
    const followingBefore = getFollowingCount("v1");

    await settle(setFollow("author-01", true, "v1"));

    const after = await settle(fetchUser("author-01", "v1"));
    expect(after?.followersCount).toBe((before?.followersCount ?? 0) + 1);
    expect(getFollowingCount("v1")).toBe(followingBefore + 1);
    expect("followersCount" in MOCK_USERS[0]).toBe(false);
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

  it("reports counts as the hidden baseline plus the graph relation count", async () => {
    const user = await settle(fetchUser("author-01", "v1"));
    expect(user?.followersCount).toBe(HIDDEN_FOLLOWERS["author-01"] + getFollowerCount("author-01"));
    expect(user?.followingCount).toBe(HIDDEN_FOLLOWING["author-01"] + getFollowingCount("author-01"));
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

describe("fetchUserByUsername", () => {
  it("matches case-insensitively", async () => {
    expect(await settle(fetchUserByUsername("AnQuoc.Dev", "v1"))).toMatchObject({ id: "author-03" });
  });

  it("returns null for an unknown username", async () => {
    expect(await settle(fetchUserByUsername("nope", "v1"))).toBeNull();
  });
});

describe("fetchFollowList", () => {
  it("pages followers 20 at a time, base users before fans", async () => {
    const page = await settle(fetchFollowList("author-01", "followers", {}, "v1"));
    expect(page.users).toHaveLength(FOLLOW_LIST_PAGE_SIZE);
    expect(page.nextPage).toBe(2);
    const firstFan = page.users.findIndex((user) => isFanId(user.id));
    expect(firstFan).toBeGreaterThan(0);
    expect(page.users.slice(0, firstFan).every((user) => !isFanId(user.id))).toBe(true);
    expect(page.users.slice(firstFan).every((user) => isFanId(user.id))).toBe(true);
  });

  it("walks every page without duplicates and ends with no nextPage", async () => {
    const ids: string[] = [];
    let page: number | undefined = 1;
    while (page) {
      const result: Awaited<ReturnType<typeof fetchFollowList>> = await settle(
        fetchFollowList("author-01", "followers", { page }, "v1"),
      );
      ids.push(...result.users.map((user) => user.id));
      page = result.nextPage;
    }
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(FOLLOW_LIST_PAGE_SIZE);
  });

  it("filters by query, diacritics-insensitive", async () => {
    const page = await settle(fetchFollowList("author-01", "followers", { query: "linh" }, "v1"));
    expect(page.users.length).toBeGreaterThan(0);
    expect(page.users.every((user) => normalizeText(`${user.displayName} ${user.username}`).includes("linh"))).toBe(true);
  });

  it("never lists the legacy guest actor even though the graph counts it", async () => {
    await settle(setFollow("author-05", true, "me"));
    const ids: string[] = [];
    let page: number | undefined = 1;
    while (page) {
      const result: Awaited<ReturnType<typeof fetchFollowList>> = await settle(
        fetchFollowList("author-05", "followers", { page }, "v1"),
      );
      ids.push(...result.users.map((user) => user.id));
      page = result.nextPage;
    }
    expect(getFollowerCount("author-05")).toBeGreaterThan(ids.length);
    expect(ids).not.toContain("me");
  });

  it("lists who a user follows", async () => {
    const page = await settle(fetchFollowList("author-01", "following", {}, "v1"));
    expect(page.users.map((user) => user.id).sort()).toEqual([...SEED_FOLLOWING["author-01"]].sort());
    expect(page.nextPage).toBeUndefined();
  });
});

describe("updateProfile", () => {
  it("updates the owner's profile and returns the projection", async () => {
    const updated = await settle(updateProfile("1", { displayName: "New Name", bio: "Hi" }, "1"));
    expect(updated).toMatchObject({ id: "1", displayName: "New Name", bio: "Hi" });
    expect(await settle(fetchUser("1", "1"))).toMatchObject({ displayName: "New Name" });
  });

  it("rejects non-owners with ForbiddenError and writes nothing", async () => {
    const attempt = updateProfile("1", { displayName: "Hacked" }, "me");
    attempt.catch(() => undefined);
    await vi.runAllTimersAsync();
    await expect(attempt).rejects.toBeInstanceOf(ForbiddenError);
    expect(await settle(fetchUser("1", "1"))).toMatchObject({ displayName: "YSocial Member" });
  });

  it.each([
    ["too short", { displayName: "A" }],
    ["too long", { displayName: "x".repeat(51) }],
    ["bio too long", { displayName: "Valid", bio: "b".repeat(161) }],
  ])("rejects an invalid patch (%s)", async (_label, patch) => {
    const attempt = updateProfile("1", patch, "1");
    attempt.catch(() => undefined);
    await vi.runAllTimersAsync();
    await expect(attempt).rejects.toThrow();
  });
});

describe("upsertViewerUser", () => {
  it("registers a runtime user, materializes the graph node and makes it fetchable", async () => {
    const created = await settle(upsertViewerUser({ id: "2", username: "new.user", displayName: "New" }, "2"));
    expect(created).toMatchObject({ id: "2", username: "new.user", displayName: "New" });
    expect(await settle(fetchUserByUsername("new.user", "2"))).toMatchObject({ id: "2" });
    expect(getFollowingCount("2")).toBe(SEED_FOLLOWED_AUTHOR_IDS.length);
  });

  it("replaces a runtime row when a different account reuses the id, but keeps edits for the same account", async () => {
    await settle(upsertViewerUser({ id: "2", username: "alice", displayName: "Alice" }, "2"));
    await settle(updateProfile("2", { displayName: "Alice Edited" }, "2"));
    await settle(upsertViewerUser({ id: "2", username: "alice", displayName: "Alice" }, "2"));
    expect(await settle(fetchUser("2", "2"))).toMatchObject({ displayName: "Alice Edited" });

    await settle(upsertViewerUser({ id: "2", username: "bob", displayName: "Bob" }, "2"));
    expect(await settle(fetchUserByUsername("bob", "2"))).toMatchObject({ id: "2", displayName: "Bob" });
    expect(await settle(fetchUserByUsername("alice", "2"))).toBeNull();
  });

  it("is a no-op for seed ids", async () => {
    await settle(upsertViewerUser({ id: "author-01", username: "hijack", displayName: "Hijack" }, "author-01"));
    expect(await settle(fetchUser("author-01", "v1"))).toMatchObject({ displayName: "Antigravity Architect" });
  });

  it("never leaks runtime or edited data into the seed lookup", async () => {
    await settle(upsertViewerUser({ id: "2", username: "new.user", displayName: "New" }, "2"));
    await settle(updateProfile("1", { displayName: "Edited" }, "1"));
    expect(getSeedUserByUsername("new.user")).toBeUndefined();
    expect(getSeedUserByUsername("ysocial_member")?.displayName).toBe("YSocial Member");
  });
});

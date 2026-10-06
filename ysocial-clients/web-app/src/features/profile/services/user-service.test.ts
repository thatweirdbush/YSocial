import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetMockUsers, fetchSuggestedUsers, searchUsers, setFollow } from "./user-service";

async function settle<T>(promise: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return promise;
}

const usernames = async (query: string) => (await settle(searchUsers(query))).map((user) => user.username);

beforeEach(() => {
  vi.useFakeTimers();
  __resetMockUsers();
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
    const users = await settle(fetchSuggestedUsers(3));
    expect(users.map((user) => user.username)).toEqual(["antigravity.core", "minhthu.design", "baongoc.writes"]);
    expect(users.every((user) => !user.isFollowing)).toBe(true);
  });
});

describe("setFollow", () => {
  it("persists follow so a refetch keeps it (idempotent set)", async () => {
    await settle(setFollow("author-01", true));
    await settle(setFollow("author-01", true));

    const suggested = await settle(fetchSuggestedUsers(8));
    expect(suggested.some((user) => user.id === "author-01")).toBe(false);
    const [user] = await settle(searchUsers("antigravity"));
    expect(user).toMatchObject({ isFollowing: true, followersCount: 48_201 });
  });
});

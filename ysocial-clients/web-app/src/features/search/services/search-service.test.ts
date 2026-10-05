import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeText } from "@/lib/text";
import { buildSearchHref, fetchSearch, fetchSuggestions, isSearchTab, resolveDefaultTab, SUGGESTION_LIMIT } from "./search-service";

async function settle<T>(promise: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return promise;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("resolveDefaultTab", () => {
  it("maps # to tags, @ to users, anything else to top", () => {
    expect(resolveDefaultTab("#x")).toBe("tags");
    expect(resolveDefaultTab(" @x")).toBe("users");
    expect(resolveDefaultTab("x")).toBe("top");
  });
});

describe("isSearchTab", () => {
  it("accepts only known tabs", () => {
    expect(isSearchTab("posts")).toBe(true);
    expect(isSearchTab("foo")).toBe(false);
    expect(isSearchTab(undefined)).toBe(false);
  });
});

describe("buildSearchHref", () => {
  it("encodes the query and appends the tab", () => {
    expect(buildSearchHref("da lat")).toBe("/search?q=da%20lat");
    expect(buildSearchHref("#NextJS", "users")).toBe("/search?q=%23NextJS&tab=users");
  });
});

describe("fetchSuggestions", () => {
  it("caps users and tags", async () => {
    const suggestions = await settle(fetchSuggestions("n"));
    expect(suggestions.users.length).toBeGreaterThan(0);
    expect(suggestions.users.length).toBeLessThanOrEqual(SUGGESTION_LIMIT);
    expect(suggestions.tags.length).toBeLessThanOrEqual(SUGGESTION_LIMIT);
  });
});

describe("fetchSuggestions tags", () => {
  it("matches tags ignoring spaces in the query", async () => {
    const { tags } = await settle(fetchSuggestions("da lat"));
    expect(tags.map((stat) => stat.tag)).toContain("ĐàLạt");
  });
});

describe("fetchSearch", () => {
  it("filters tags by the query without the leading #", async () => {
    const result = await settle(fetchSearch("#design"));
    expect(result.tags.length).toBeGreaterThan(0);
    expect(result.tags.every((stat) => normalizeText(stat.tag).includes("design"))).toBe(true);
  });

  it("resolves at once without calling services for a blank query", async () => {
    await expect(fetchSearch("  ")).resolves.toEqual({ users: [], posts: [], tags: [] });
  });
});

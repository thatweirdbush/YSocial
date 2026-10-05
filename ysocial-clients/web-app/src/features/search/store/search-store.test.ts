import { beforeEach, describe, expect, it } from "vitest";
import { RECENT_LIMIT, resetSearchStore, useSearchStore } from "./search-store";

const STORAGE_KEY = "ysocial_recent_searches";
const actions = () => useSearchStore.getState().actions;
const recent = () => useSearchStore.getState().recent;

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEY);
  resetSearchStore();
});

describe("search-store recent searches", () => {
  it("dedupes by normalized text and moves the newest to the top", () => {
    actions().addRecent(" Đà Lạt ");
    actions().addRecent("zinc");
    actions().addRecent("da lat");
    expect(recent()).toEqual(["da lat", "zinc"]);
  });

  it(`keeps at most ${RECENT_LIMIT} entries, newest first`, () => {
    for (let i = 1; i <= 12; i++) actions().addRecent(`q${i}`);
    expect(recent()).toHaveLength(RECENT_LIMIT);
    expect(recent()[0]).toBe("q12");
  });

  it("ignores blank queries", () => {
    actions().addRecent("   ");
    expect(recent()).toEqual([]);
  });

  it("removes one entry by normalized match and clears all", () => {
    actions().addRecent("Đà Lạt");
    actions().addRecent("zinc");
    actions().removeRecent("da lat");
    expect(recent()).toEqual(["zinc"]);

    actions().clearRecent();
    expect(recent()).toEqual([]);
  });

  it("persists only the recent list", () => {
    actions().addRecent("zinc");
    actions().setResult({ query: "zinc", userIds: [], postIds: ["post-004"], tags: [] });

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    expect(stored.state).toEqual({ recent: ["zinc"] });
  });
});

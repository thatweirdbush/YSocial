import { describe, expect, it } from "vitest";
import type { NotificationItemData } from "../types";
import { GROUP_WINDOW_MS, groupNotifications } from "./group-notifications";

const NOW = Date.UTC(2026, 9, 16, 12, 0, 0);
const at = (minutesAgo: number): string => new Date(NOW - minutesAgo * 60_000).toISOString();
const make = (id: string, minutesAgo: number, overrides: Partial<NotificationItemData> = {}): NotificationItemData => ({
  id,
  kind: "like",
  user: { id: `user-${id}`, username: id, displayName: id.toUpperCase() },
  createdAt: at(minutesAgo),
  isRead: false,
  postId: "p1",
  ...overrides,
});
const HOUR = 60;
const shape = (rows: ReturnType<typeof groupNotifications>) => rows.map((row) => (row.type === "likeGroup" ? row.items.map((entry) => entry.id) : row.item.id));

describe("groupNotifications", () => {
  it("groups likes of the same post, newest first; the group sits where its newest member is", () => {
    const rows = groupNotifications([make("a", 1), make("r", 2, { kind: "reply" }), make("b", 3), make("c", 4)]);
    expect(shape(rows)).toEqual([["a", "b", "c"], "r"]);
  });

  it("never merges likes of different posts", () => {
    const rows = groupNotifications([make("a", 1), make("b", 2, { postId: "p2" }), make("c", 3)]);
    expect(shape(rows)).toEqual([["a", "c"], "b"]);
  });

  it("a lone like stays a plain row", () => {
    expect(shape(groupNotifications([make("a", 1)]))).toEqual(["a"]);
  });

  it("only likes are grouped: replies, follows, mentions & unknown kinds stay single", () => {
    const rows = groupNotifications([
      make("r1", 1, { kind: "reply" }),
      make("r2", 2, { kind: "reply" }),
      make("f1", 3, { kind: "follow", postId: undefined }),
      make("f2", 4, { kind: "follow", postId: undefined }),
      make("m1", 5, { kind: "mention" }),
      make("o1", 6, { kind: "other", postId: undefined }),
    ]);
    expect(shape(rows)).toEqual(["r1", "r2", "f1", "f2", "m1", "o1"]);
  });

  it("a like without a post id cannot be grouped", () => {
    expect(shape(groupNotifications([make("a", 1, { postId: undefined }), make("b", 2, { postId: undefined })]))).toEqual(["a", "b"]);
  });

  describe("24h window from the group's NEWEST member", () => {
    it("23h59m after the newest still joins, 24h01m opens a new group", () => {
      const rows = groupNotifications([
        make("a", 0),
        make("b", 23 * HOUR + 59),
        make("c", 24 * HOUR + 1),
        make("d", 24 * HOUR + 2),
      ]);
      expect(shape(rows)).toEqual([["a", "b"], ["c", "d"]]);
    });

    it("exactly 24h joins (inclusive)", () => {
      expect(GROUP_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
      expect(shape(groupNotifications([make("a", 0), make("b", 24 * HOUR)]))).toEqual([["a", "b"]]);
    });

    it("the window is anchored on the newest member, not chained through the previous one", () => {
      // b is 20h after a, c is 20h after b (40h after a): c must not ride along
      const rows = groupNotifications([make("a", 0), make("b", 20 * HOUR), make("c", 40 * HOUR)]);
      expect(shape(rows)).toEqual([["a", "b"], "c"]);
    });
  });

  it("exposes the exact number of LOADED members (never an unseen total)", () => {
    const [row] = groupNotifications([make("a", 1), make("b", 2), make("c", 3)]);
    expect(row.type === "likeGroup" && row.items).toHaveLength(3);
  });

  it("group key is the newest member id: stable while older pages append, new after a push", () => {
    const first = groupNotifications([make("b", 2), make("c", 3)])[0];
    const afterOlderPage = groupNotifications([make("b", 2), make("c", 3), make("d", 4)])[0];
    const afterPush = groupNotifications([make("a", 1), make("b", 2), make("c", 3)])[0];
    expect(first.key).toBe(afterOlderPage.key);
    expect(afterPush.key).not.toBe(first.key);
  });

  it("regroups from scratch: a page appended to the tail extends the tail group only", () => {
    const head = [make("a", 0), make("b", 1)];
    const tail = [make("c", 2), make("d", 3, { postId: "p2" }), make("e", 4, { postId: "p2" })];
    expect(shape(groupNotifications([...head, ...tail]))).toEqual([["a", "b", "c"], ["d", "e"]]);
  });

  it("an item read or unread does not change the grouping", () => {
    expect(shape(groupNotifications([make("a", 1, { isRead: true }), make("b", 2)]))).toEqual([["a", "b"]]);
  });

  it("empty input", () => {
    expect(groupNotifications([])).toEqual([]);
  });

  it("every input item appears exactly once", () => {
    const input = [make("a", 1), make("b", 2), make("r", 3, { kind: "reply" }), make("c", 30 * HOUR), make("d", 31 * HOUR)];
    const flat = groupNotifications(input).flatMap((row) => (row.type === "likeGroup" ? row.items : [row.item]));
    expect(flat.map((entry) => entry.id).sort()).toEqual(["a", "b", "c", "d", "r"]);
  });
});

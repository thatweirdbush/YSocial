import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth";
import { setRealSlices } from "@/test/api-test-utils";
import * as service from "../services/notification-service";
import type { NotificationItemData, NotificationPage } from "../types";
import {
  commitMarkAllRead,
  commitMarkRead,
  loadMoreNotifications,
  loadNotifications,
  pushNotification,
  resetNotificationStore,
  useNotificationStore,
} from "./notification-store";

const make = (id: string, overrides: Partial<NotificationItemData> = {}): NotificationItemData => ({
  id,
  kind: "like",
  user: { id: "u1", username: "u", displayName: "U" },
  createdAt: "2026-10-16T10:00:00Z",
  isRead: false,
  postId: "p1",
  ...overrides,
});
const page = (ids: string[], overrides: Partial<NotificationPage> = {}): NotificationPage => ({
  items: ids.map((id) => make(id)),
  unreadCount: ids.length,
  ...overrides,
});
const state = () => useNotificationStore.getState();
const ids = () => state().items.map((entry) => entry.id);

beforeEach(() => {
  resetNotificationStore();
  setRealSlices("auth,content,graph,activity");
  useAuthStore.setState({ isAuthenticated: true });
});
afterEach(() => {
  vi.restoreAllMocks();
  useAuthStore.setState({ isAuthenticated: false });
});

describe("loading", () => {
  it("first page fills items, unread count & next page", async () => {
    vi.spyOn(service, "fetchNotifications").mockResolvedValue(page(["a", "b"], { nextPage: 2, unreadCount: 9 }));
    await loadNotifications();
    expect(ids()).toEqual(["a", "b"]);
    expect(state()).toMatchObject({ status: "ready", unreadCount: 9, nextPage: 2 });
  });

  it("failure -> error status, retry loads", async () => {
    const spy = vi.spyOn(service, "fetchNotifications").mockRejectedValueOnce(new Error("boom")).mockResolvedValue(page(["a"]));
    await loadNotifications();
    expect(state().status).toBe("error");
    await loadNotifications();
    expect(state()).toMatchObject({ status: "ready" });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("real mode guest: empty ready list, no call", async () => {
    useAuthStore.setState({ isAuthenticated: false });
    const spy = vi.spyOn(service, "fetchNotifications");
    await loadNotifications();
    expect(spy).not.toHaveBeenCalled();
    expect(state()).toMatchObject({ status: "ready", items: [] });
  });

  it("load more appends & skips duplicates already received by push", async () => {
    vi.spyOn(service, "fetchNotifications")
      .mockResolvedValueOnce(page(["a"], { nextPage: 2 }))
      .mockResolvedValueOnce(page(["a", "b"]));
    await loadNotifications();
    await loadMoreNotifications();
    expect(ids()).toEqual(["a", "b"]);
    expect(state().nextPage).toBeUndefined();
  });

  it("a reset during a load drops the stale response", async () => {
    let resolve!: (value: NotificationPage) => void;
    vi.spyOn(service, "fetchNotifications").mockReturnValue(new Promise((res) => (resolve = res)));
    const load = loadNotifications();
    resetNotificationStore();
    resolve(page(["stale"]));
    await load;
    expect(ids()).toEqual([]);
  });
});

describe("mark read", () => {
  beforeEach(async () => {
    vi.spyOn(service, "fetchNotifications").mockResolvedValue(page(["a", "b"]));
    await loadNotifications();
  });

  it("optimistic read, unread - 1, service called once", async () => {
    const spy = vi.spyOn(service, "markNotificationRead").mockResolvedValue();
    const commit = commitMarkRead("a");
    expect(state().items[0].isRead).toBe(true);
    expect(state().unreadCount).toBe(1);
    await expect(commit).resolves.toBe(true);
    await commitMarkRead("a");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("rolls back when the service rejects (403 foreign)", async () => {
    vi.spyOn(service, "markNotificationRead").mockRejectedValue(new Error("403"));
    await expect(commitMarkRead("a")).resolves.toBe(false);
    expect(state().items[0].isRead).toBe(false);
    expect(state().unreadCount).toBe(2);
  });

  it("read-all clears every unread, rolls back on failure", async () => {
    vi.spyOn(service, "markAllNotificationsRead").mockRejectedValueOnce(new Error("x")).mockResolvedValue();
    await expect(commitMarkAllRead()).resolves.toBe(false);
    expect(state()).toMatchObject({ unreadCount: 2 });
    expect(state().items.every((entry) => !entry.isRead)).toBe(true);
    await expect(commitMarkAllRead()).resolves.toBe(true);
    expect(state().unreadCount).toBe(0);
    expect(state().items.every((entry) => entry.isRead)).toBe(true);
  });
});

describe("push", () => {
  it("inserts at the top & bumps unread", () => {
    useNotificationStore.setState({ items: [make("a")], unreadCount: 1, status: "ready" });
    expect(pushNotification(make("live"))).toBe(true);
    expect(ids()).toEqual(["live", "a"]);
    expect(state().unreadCount).toBe(2);
  });

  it("duplicate push for the same id is ignored", () => {
    useNotificationStore.setState({ items: [make("a")], unreadCount: 1, status: "ready" });
    expect(pushNotification(make("a"))).toBe(false);
    expect(ids()).toEqual(["a"]);
    expect(state().unreadCount).toBe(1);
  });

  it("an already-read push does not bump unread", () => {
    pushNotification(make("r", { isRead: true }));
    expect(state().unreadCount).toBe(0);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth";
import { setRealSlices } from "@/test/api-test-utils";
import * as service from "../services/notification-service";
import type { NotificationFilter, NotificationItemData, NotificationPage } from "../types";
import {
  commitMarkAllRead,
  commitMarkRead,
  dropNotificationsFrom,
  loadMoreNotifications,
  loadNotifications,
  pushNotification,
  refreshNotifications,
  resetNotificationStore,
  selectItems,
  syncUnreadCount,
  useNotificationStore,
} from "./notification-store";

/** `minutes` = age: a smaller number is newer. Ids sort the same way in the lists below. */
const at = (minutes: number): string => new Date(Date.UTC(2026, 9, 16, 12, 0, 0) - minutes * 60_000).toISOString();
const make = (id: string, overrides: Partial<NotificationItemData> = {}): NotificationItemData => ({
  id,
  kind: "like",
  user: { id: "u1", username: "u", displayName: "U" },
  createdAt: at(1),
  isRead: false,
  postId: "p1",
  ...overrides,
});
const page = (items: NotificationItemData[], overrides: Partial<NotificationPage> = {}): NotificationPage => ({
  items,
  unreadCount: items.filter((entry) => !entry.isRead).length,
  ...overrides,
});
/** Items a, b, c ... aged 1, 2, 3 minutes: newest first. */
const items = (...names: string[]): NotificationItemData[] => names.map((name, index) => make(name, { createdAt: at(index + 1) }));
const state = () => useNotificationStore.getState();
const ids = (filter: NotificationFilter = "all") => selectItems(state(), filter).map((entry) => entry.id);
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

beforeEach(() => {
  resetNotificationStore();
  setRealSlices("auth,content,graph,activity");
  useAuthStore.setState({ isAuthenticated: true });
});
afterEach(() => {
  vi.restoreAllMocks();
  useAuthStore.setState({ isAuthenticated: false });
});

describe("loading per filter", () => {
  it("first page fills the list, unread count & next page", async () => {
    vi.spyOn(service, "fetchNotifications").mockResolvedValue(page(items("a", "b"), { nextPage: 2, unreadCount: 9 }));
    await loadNotifications();
    expect(ids()).toEqual(["a", "b"]);
    expect(state().lists.all).toMatchObject({ status: "ready", nextPage: 2 });
    expect(state().unreadCount).toBe(9);
  });

  it("each filter is its own list with its own paging; the others stay untouched", async () => {
    const spy = vi.spyOn(service, "fetchNotifications");
    spy.mockResolvedValueOnce(page(items("a", "b"), { unreadCount: 2 }));
    spy.mockResolvedValueOnce(page([make("l1", { createdAt: at(3) })], { nextPage: 2, unreadCount: 2 }));
    await loadNotifications("all");
    await loadNotifications("likes");
    expect(spy).toHaveBeenLastCalledWith(1, "likes");
    expect(ids("likes")).toEqual(["l1"]);
    expect(ids("all")).toEqual(["a", "b"]);
    expect(state().lists.likes.nextPage).toBe(2);
    expect(state().lists.replies.status).toBe("idle");
  });

  it("an item shared by two lists is one record: reading it in one tab reads it in the other", async () => {
    const spy = vi.spyOn(service, "fetchNotifications");
    spy.mockResolvedValueOnce(page(items("a"), { unreadCount: 1 }));
    spy.mockResolvedValueOnce(page(items("a"), { unreadCount: 1 }));
    vi.spyOn(service, "markNotificationRead").mockResolvedValue();
    await loadNotifications("all");
    await loadNotifications("likes");
    await commitMarkRead("a");
    expect(selectItems(state(), "likes")[0].isRead).toBe(true);
    expect(selectItems(state(), "all")[0].isRead).toBe(true);
  });

  it("the unread count of a mentions page is never applied (real mentions are always empty)", async () => {
    state();
    useNotificationStore.setState({ unreadCount: 4 });
    vi.spyOn(service, "fetchNotifications").mockResolvedValue(page([], { unreadCount: 0 }));
    await loadNotifications("mentions");
    expect(state().unreadCount).toBe(4);
  });

  it("failure -> error status, retry loads", async () => {
    const spy = vi.spyOn(service, "fetchNotifications").mockRejectedValueOnce(new Error("boom")).mockResolvedValue(page(items("a")));
    await loadNotifications();
    expect(state().lists.all.status).toBe("error");
    await loadNotifications();
    expect(state().lists.all.status).toBe("ready");
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("real mode guest: empty ready list, no call", async () => {
    useAuthStore.setState({ isAuthenticated: false });
    const spy = vi.spyOn(service, "fetchNotifications");
    await loadNotifications("likes");
    expect(spy).not.toHaveBeenCalled();
    expect(state().lists.likes.status).toBe("ready");
    expect(ids("likes")).toEqual([]);
  });

  it("load more appends in the same list & skips duplicates already received by push", async () => {
    const spy = vi.spyOn(service, "fetchNotifications");
    spy.mockResolvedValueOnce(page(items("a"), { nextPage: 2 }));
    spy.mockResolvedValueOnce(page([make("a", { createdAt: at(1) }), make("b", { createdAt: at(2) })]));
    await loadNotifications();
    await loadMoreNotifications();
    expect(spy).toHaveBeenLastCalledWith(2, "all");
    expect(ids()).toEqual(["a", "b"]);
    expect(state().lists.all.nextPage).toBeUndefined();
  });

  it("a reset during a load drops the stale response", async () => {
    const pending = deferred<NotificationPage>();
    vi.spyOn(service, "fetchNotifications").mockReturnValue(pending.promise);
    const load = loadNotifications();
    resetNotificationStore();
    pending.resolve(page(items("stale")));
    await load;
    expect(ids()).toEqual([]);
  });
});

describe("unread count stays server-authoritative", () => {
  it("a push that lands during the first page load keeps its +1: the stale page count is not applied, a sync follows", async () => {
    const list = deferred<NotificationPage>();
    vi.spyOn(service, "fetchNotifications").mockReturnValue(list.promise);
    const sync = vi.spyOn(service, "fetchUnreadCount").mockResolvedValue(3);
    const load = loadNotifications();
    pushNotification(make("live", { createdAt: at(0) }));
    list.resolve(page(items("a", "b"), { unreadCount: 2 }));
    await load;
    await vi.waitFor(() => expect(sync).toHaveBeenCalled());
    await vi.waitFor(() => expect(state().unreadCount).toBe(3));
    expect(ids()).toEqual(["live", "a", "b"]);
  });

  it("syncUnreadCount applies the BE count", async () => {
    vi.spyOn(service, "fetchUnreadCount").mockResolvedValue(7);
    await syncUnreadCount();
    expect(state().unreadCount).toBe(7);
  });

  it("a push during the unread-count request: that response is dropped & the request is repeated once", async () => {
    const first = deferred<number>();
    const spy = vi.spyOn(service, "fetchUnreadCount").mockReturnValueOnce(first.promise).mockResolvedValueOnce(5);
    const sync = syncUnreadCount();
    pushNotification(make("live"));
    first.resolve(2);
    await sync;
    expect(spy).toHaveBeenCalledTimes(2);
    expect(state().unreadCount).toBe(5);
  });

  it("a second stale answer is not applied either (no endless retry)", async () => {
    const first = deferred<number>();
    const second = deferred<number>();
    const spy = vi.spyOn(service, "fetchUnreadCount").mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const sync = syncUnreadCount();
    pushNotification(make("live-1"));
    first.resolve(2);
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    pushNotification(make("live-2"));
    second.resolve(2);
    await sync;
    expect(spy).toHaveBeenCalledTimes(2);
    expect(state().unreadCount).toBe(2);
  });

  it("a failed sync is silent; a reset drops a stale answer; a real-mode guest makes no request", async () => {
    const spy = vi.spyOn(service, "fetchUnreadCount").mockRejectedValueOnce(new Error("offline"));
    await syncUnreadCount();
    expect(state().unreadCount).toBe(0);

    const late = deferred<number>();
    spy.mockReturnValueOnce(late.promise);
    const pending = syncUnreadCount();
    resetNotificationStore();
    late.resolve(9);
    await pending;
    expect(state().unreadCount).toBe(0);

    useAuthStore.setState({ isAuthenticated: false });
    spy.mockClear();
    await syncUnreadCount();
    expect(spy).not.toHaveBeenCalled();
  });

  it("push dedupes by id across lists: the same notification never counts twice", () => {
    useNotificationStore.setState({ unreadCount: 1 });
    expect(pushNotification(make("x"))).toBe(true);
    expect(pushNotification(make("x"))).toBe(false);
    expect(state().unreadCount).toBe(2);
  });

  it("an already-read push does not bump unread", () => {
    pushNotification(make("r", { isRead: true }));
    expect(state().unreadCount).toBe(0);
  });

  it("push routes to the loaded lists of its kind only, newest on top", async () => {
    const spy = vi.spyOn(service, "fetchNotifications");
    spy.mockResolvedValueOnce(page(items("a")));
    spy.mockResolvedValueOnce(page([]));
    await loadNotifications("all");
    await loadNotifications("likes");
    pushNotification(make("like-1", { kind: "like", createdAt: at(0) }));
    pushNotification(make("reply-1", { kind: "reply", createdAt: at(0) }));
    expect(ids("all")).toEqual(["reply-1", "like-1", "a"]);
    expect(ids("likes")).toEqual(["like-1"]);
    expect(state().lists.replies.ids).toEqual([]);
    expect(state().byId["reply-1"]).toBeDefined();
  });
});

describe("refresh (catch-up after the live socket was down)", () => {
  it("refreshes every loaded list, missed items on top, BE count wins", async () => {
    const spy = vi.spyOn(service, "fetchNotifications");
    spy.mockResolvedValueOnce(page(items("a"), { nextPage: 2, unreadCount: 1 }));
    await loadNotifications();
    spy.mockResolvedValueOnce(page([make("n2", { createdAt: at(0) }), ...items("a")], { nextPage: 2, unreadCount: 3 }));
    await refreshNotifications();
    expect(ids()).toEqual(["n2", "a"]);
    expect(state().unreadCount).toBe(3);
    expect(state().lists.all).toMatchObject({ status: "ready", nextPage: 2 });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("with the page not loaded it only syncs the count", async () => {
    const list = vi.spyOn(service, "fetchNotifications");
    const count = vi.spyOn(service, "fetchUnreadCount").mockResolvedValue(6);
    await refreshNotifications();
    expect(list).not.toHaveBeenCalled();
    expect(count).toHaveBeenCalled();
    expect(state().unreadCount).toBe(6);
  });

  it("failure is silent; a push during the refresh keeps its +1; a reset drops a stale response", async () => {
    const spy = vi.spyOn(service, "fetchNotifications");
    spy.mockResolvedValueOnce(page(items("a")));
    await loadNotifications();
    spy.mockRejectedValueOnce(new Error("offline"));
    await refreshNotifications();
    expect(ids()).toEqual(["a"]);

    const slow = deferred<NotificationPage>();
    spy.mockReturnValueOnce(slow.promise);
    vi.spyOn(service, "fetchUnreadCount").mockResolvedValue(2);
    const pending = refreshNotifications();
    pushNotification(make("live", { createdAt: at(0) }));
    slow.resolve(page(items("a"), { unreadCount: 1 }));
    await pending;
    await vi.waitFor(() => expect(state().unreadCount).toBe(2));

    const stale = deferred<NotificationPage>();
    spy.mockReturnValueOnce(stale.promise);
    const dropped = refreshNotifications();
    resetNotificationStore();
    stale.resolve(page(items("late")));
    await dropped;
    expect(ids()).toEqual([]);
  });
});

describe("mark one read", () => {
  beforeEach(async () => {
    vi.spyOn(service, "fetchNotifications").mockResolvedValue(page(items("a", "b")));
    await loadNotifications();
  });

  it("optimistic read, unread - 1, service called once", async () => {
    const spy = vi.spyOn(service, "markNotificationRead").mockResolvedValue();
    const commit = commitMarkRead("a");
    expect(selectItems(state(), "all")[0].isRead).toBe(true);
    expect(state().unreadCount).toBe(1);
    await expect(commit).resolves.toBe(true);
    await commitMarkRead("a");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("rolls back when the service rejects (403 foreign)", async () => {
    vi.spyOn(service, "markNotificationRead").mockRejectedValue(new Error("403"));
    await expect(commitMarkRead("a")).resolves.toBe(false);
    expect(selectItems(state(), "all")[0].isRead).toBe(false);
    expect(state().unreadCount).toBe(2);
  });

  it("unknown id is a no-op", async () => {
    const spy = vi.spyOn(service, "markNotificationRead");
    await expect(commitMarkRead("nope")).resolves.toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("mark all read (bounded, single flight)", () => {
  beforeEach(async () => {
    vi.spyOn(service, "fetchNotifications").mockResolvedValue(page(items("a", "b", "c"), { unreadCount: 3 }));
    await loadNotifications();
  });

  it("sends the newest loaded id as the bound and flips every loaded item", async () => {
    const spy = vi.spyOn(service, "markAllNotificationsRead").mockResolvedValue();
    vi.spyOn(service, "fetchUnreadCount").mockResolvedValue(0);
    await expect(commitMarkAllRead()).resolves.toBe(true);
    expect(spy).toHaveBeenCalledWith("a");
    expect(selectItems(state(), "all").every((entry) => entry.isRead)).toBe(true);
    expect(state().unreadCount).toBe(0);
  });

  it("an item that arrives while the request is in flight stays unread, and the count re-syncs from the server", async () => {
    const gate = deferred<void>();
    vi.spyOn(service, "markAllNotificationsRead").mockReturnValue(gate.promise);
    const sync = vi.spyOn(service, "fetchUnreadCount").mockResolvedValue(1);
    const commit = commitMarkAllRead();
    pushNotification(make("live", { createdAt: at(0) }));
    gate.resolve();
    await commit;
    expect(state().byId.live.isRead).toBe(false);
    expect(state().byId.a.isRead).toBe(true);
    await vi.waitFor(() => expect(state().unreadCount).toBe(1));
    expect(sync).toHaveBeenCalled();
  });

  it("failure reverts ONLY what this call flipped and keeps a push that arrived meanwhile (no snapshot count restore)", async () => {
    const gate = deferred<void>();
    vi.spyOn(service, "markAllNotificationsRead").mockReturnValue(gate.promise);
    vi.spyOn(service, "fetchUnreadCount").mockResolvedValue(4);
    useNotificationStore.setState((current) => ({ byId: { ...current.byId, b: { ...current.byId.b, isRead: true } }, unreadCount: 2 }));
    const commit = commitMarkAllRead();
    pushNotification(make("live", { createdAt: at(0) }));
    gate.reject(new Error("500"));
    await expect(commit).resolves.toBe(false);
    expect(state().byId.a.isRead).toBe(false);
    expect(state().byId.b.isRead).toBe(true);
    expect(state().byId.c.isRead).toBe(false);
    expect(state().byId.live.isRead).toBe(false);
    await vi.waitFor(() => expect(state().unreadCount).toBe(4));
  });

  it("a second call while one is in flight shares it: one request", async () => {
    const gate = deferred<void>();
    const spy = vi.spyOn(service, "markAllNotificationsRead").mockReturnValue(gate.promise);
    vi.spyOn(service, "fetchUnreadCount").mockResolvedValue(0);
    const first = commitMarkAllRead();
    const second = commitMarkAllRead();
    gate.resolve();
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("a tie on the watermark time is flipped (same rule as the BE `<=`)", async () => {
    useNotificationStore.setState((current) => ({ byId: { ...current.byId, b: { ...current.byId.b, createdAt: current.byId.a.createdAt } } }));
    vi.spyOn(service, "markAllNotificationsRead").mockResolvedValue();
    vi.spyOn(service, "fetchUnreadCount").mockResolvedValue(0);
    await commitMarkAllRead();
    expect(state().byId.b.isRead).toBe(true);
  });

  it("with nothing loaded there is nothing to bound: no request", async () => {
    resetNotificationStore();
    const spy = vi.spyOn(service, "markAllNotificationsRead").mockResolvedValue();
    await expect(commitMarkAllRead()).resolves.toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it("a reset during the request drops both outcomes", async () => {
    const gate = deferred<void>();
    vi.spyOn(service, "markAllNotificationsRead").mockReturnValue(gate.promise);
    const count = vi.spyOn(service, "fetchUnreadCount").mockResolvedValue(8);
    const commit = commitMarkAllRead();
    resetNotificationStore();
    gate.resolve();
    await commit;
    expect(state().unreadCount).toBe(0);
    expect(count).not.toHaveBeenCalled();
  });
});

describe("blocking a sender", () => {
  it("purges their items from every list, takes their unread off at once, then re-syncs the count", async () => {
    vi.spyOn(service, "fetchNotifications").mockResolvedValue(
      page([make("a", { user: { id: "bad", username: "b", displayName: "B" } }), make("b", { createdAt: at(2) })], { unreadCount: 5 }),
    );
    const sync = vi.spyOn(service, "fetchUnreadCount").mockResolvedValue(3);
    await loadNotifications();
    dropNotificationsFrom("bad");
    expect(ids()).toEqual(["b"]);
    expect(state().byId.a).toBeUndefined();
    expect(state().unreadCount).toBe(4);
    await vi.waitFor(() => expect(state().unreadCount).toBe(3));
    expect(sync).toHaveBeenCalled();
  });

  it("nothing loaded from that sender: the list is unchanged but the count still re-syncs (unloaded pages may hold their items)", async () => {
    vi.spyOn(service, "fetchNotifications").mockResolvedValue(page(items("a"), { unreadCount: 6 }));
    const sync = vi.spyOn(service, "fetchUnreadCount").mockResolvedValue(2);
    await loadNotifications();
    dropNotificationsFrom("someone-else");
    expect(ids()).toEqual(["a"]);
    await vi.waitFor(() => expect(state().unreadCount).toBe(2));
    expect(sync).toHaveBeenCalled();
  });
});

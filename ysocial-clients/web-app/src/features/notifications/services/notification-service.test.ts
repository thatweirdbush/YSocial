import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth/store/auth-store";
import { API_BASE_URL } from "@/lib/api-config";
import { mockFetchSequence, problem, setRealSlices, type MockStep } from "@/test/api-test-utils";
import {
  fetchNotificationPreferences,
  fetchNotifications,
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
  resetMockNotificationState,
  saveNotificationPreferences,
} from "./notification-service";

const ID = "11111111-1111-4111-8111-111111111111";
const SENDER = "22222222-2222-4222-8222-222222222222";

const item = (id: string) => ({ id, type: "NewFollow", kind: "follow", createdAt: "2026-10-16T10:00:00Z", isRead: false, senderId: SENDER, senderUsername: "s" });

function useFetch(steps: MockStep[]) {
  const fake = mockFetchSequence(steps);
  vi.stubGlobal("fetch", fake.fetchFn);
  return fake.calls;
}
const path = (call: { url: string }) => call.url.replace(API_BASE_URL, "");

beforeEach(() => {
  localStorage.clear();
  useAuthStore.getState().actions.clearAuth();
  useAuthStore.getState().actions.setTokens("A1", "R1");
});
afterEach(() => vi.unstubAllGlobals());

describe("real adapter", () => {
  beforeEach(() => setRealSlices("auth,content,graph,activity"));

  it("list pages & unreadCount", async () => {
    const calls = useFetch([{ status: 200, body: { items: [item(ID)], page: 2, pageSize: 20, totalCount: 30, hasNextPage: true, unreadCount: 4 } }]);
    const page = await fetchNotifications(2);
    expect(path(calls[0])).toBe("/api/notifications?page=2&pageSize=20");
    expect(page).toMatchObject({ nextPage: 3, unreadCount: 4 });
    expect(page.items[0]).toMatchObject({ id: ID, kind: "follow" });
  });

  it.each([
    ["likes", "like"],
    ["replies", "reply"],
    ["follows", "follow"],
  ] as const)("filter %s sends kind=%s", async (filter, kind) => {
    const calls = useFetch([{ status: 200, body: { items: [], page: 1, pageSize: 20, totalCount: 0, hasNextPage: false, unreadCount: 3 } }]);
    const page = await fetchNotifications(1, filter);
    expect(path(calls[0])).toBe(`/api/notifications?page=1&pageSize=20&kind=${kind}`);
    expect(page.unreadCount).toBe(3);
  });

  it("filter all sends no kind", async () => {
    const calls = useFetch([{ status: 200, body: { items: [], page: 1, pageSize: 20, totalCount: 0, hasNextPage: false, unreadCount: 0 } }]);
    await fetchNotifications(1, "all");
    expect(path(calls[0])).toBe("/api/notifications?page=1&pageSize=20");
  });

  it("mentions never reach the real BE (it would answer 400): empty page, no request", async () => {
    const calls = useFetch([]);
    const page = await fetchNotifications(1, "mentions");
    expect(page).toEqual({ items: [], nextPage: undefined, unreadCount: 0 });
    expect(calls).toHaveLength(0);
  });

  it("read-all can be bounded by the newest seen id", async () => {
    const calls = useFetch([{ status: 204 }, { status: 204 }]);
    await markAllNotificationsRead(ID);
    await markAllNotificationsRead();
    expect(calls.map((call) => path(call))).toEqual([`/api/notifications/read-all?upToId=${ID}`, "/api/notifications/read-all"]);
  });

  it("read-all with a mock id never sends it (BE ids are GUIDs)", async () => {
    const calls = useFetch([{ status: 204 }]);
    await markAllNotificationsRead("notif-1");
    expect(path(calls[0])).toBe("/api/notifications/read-all");
  });

  it("preferences GET & full-replace PUT", async () => {
    const calls = useFetch([
      { status: 200, body: { likes: true, replies: false, follows: true } },
      { status: 200, body: { likes: false, replies: false, follows: true } },
    ]);
    expect(await fetchNotificationPreferences()).toEqual({ likes: true, replies: false, follows: true });
    expect(await saveNotificationPreferences({ likes: false, replies: false, follows: true })).toEqual({ likes: false, replies: false, follows: true });
    expect(calls.map((call) => [call.init?.method ?? "GET", path(call)])).toEqual([
      ["GET", "/api/notifications/preferences"],
      ["PUT", "/api/notifications/preferences"],
    ]);
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({ likes: false, replies: false, follows: true });
  });

  it("unread count endpoint", async () => {
    const calls = useFetch([{ status: 200, body: { count: 7 } }, { status: 200, body: {} }]);
    expect(await fetchUnreadCount()).toBe(7);
    expect(path(calls[0])).toBe("/api/notifications/unread-count");
    expect(await fetchUnreadCount()).toBe(0);
  });

  it("mark read is PUT 204 (idempotent) & read-all", async () => {
    const calls = useFetch([{ status: 204 }, { status: 204 }, { status: 204 }]);
    await markNotificationRead(ID);
    await markNotificationRead(ID);
    await markAllNotificationsRead();
    expect(calls.map((call) => [call.init?.method, path(call)])).toEqual([
      ["PUT", `/api/notifications/${ID}/read`],
      ["PUT", `/api/notifications/${ID}/read`],
      ["PUT", "/api/notifications/read-all"],
    ]);
  });

  it("foreign notification 403 is surfaced", async () => {
    useFetch([problem(403, "NotNotificationRecipient")]);
    await expect(markNotificationRead(ID)).rejects.toMatchObject({ status: 403, code: "NotNotificationRecipient" });
  });

  it("non-GUID id rejects locally without fetch", async () => {
    const calls = useFetch([]);
    await expect(markNotificationRead("notif-1")).rejects.toMatchObject({ status: 404 });
    expect(calls).toHaveLength(0);
  });
});

describe("mock adapter", () => {
  it("mock mode shows seed notifications", async () => {
    setRealSlices("none");
    const page = await fetchNotifications(1);
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.unreadCount).toBe(page.items.filter((entry) => !entry.isRead).length);
    await expect(markAllNotificationsRead()).resolves.toBeUndefined();
  });

  it.each([
    ["likes", ["like"]],
    ["replies", ["reply"]],
    ["follows", ["follow"]],
    ["mentions", ["mention"]],
  ] as const)("mock filter %s returns only %j, overall unread count, newest first", async (filter, kinds) => {
    setRealSlices("none");
    const all = await fetchNotifications(1);
    const page = await fetchNotifications(1, filter);
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.every((entry) => kinds.includes(entry.kind as never))).toBe(true);
    expect(page.unreadCount).toBe(all.unreadCount);
    const times = page.items.map((entry) => new Date(entry.createdAt).getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it("mock seed has parseable ISO dates and a groupable like pair on one post", async () => {
    setRealSlices("none");
    const page = await fetchNotifications(1);
    expect(page.items.every((entry) => !Number.isNaN(new Date(entry.createdAt).getTime()))).toBe(true);
    const likesOnPost1 = page.items.filter((entry) => entry.kind === "like" && entry.postId === "post-1");
    expect(likesOnPost1.length).toBeGreaterThanOrEqual(2);
  });

  it("mock adapter remembers read marks: single, and bounded read-all (ties included)", async () => {
    setRealSlices("none");
    resetMockNotificationState();
    const first = await fetchNotifications(1);
    const [newest, second] = first.items;
    await markNotificationRead(second.id);
    expect((await fetchNotifications(1)).items.find((entry) => entry.id === second.id)?.isRead).toBe(true);

    await markAllNotificationsRead(second.id);
    const after = await fetchNotifications(1);
    expect(after.items.find((entry) => entry.id === newest.id)?.isRead).toBe(newest.isRead);
    expect(after.items.filter((entry) => new Date(entry.createdAt) <= new Date(second.createdAt)).every((entry) => entry.isRead)).toBe(true);

    await markAllNotificationsRead();
    expect((await fetchNotifications(1)).unreadCount).toBe(0);
    expect(await fetchUnreadCount()).toBe(0);
    resetMockNotificationState();
  });

  it("mock preferences are in-memory, default on, full replace", async () => {
    setRealSlices("none");
    resetMockNotificationState();
    expect(await fetchNotificationPreferences()).toEqual({ likes: true, replies: true, follows: true });
    await saveNotificationPreferences({ likes: false, replies: true, follows: true });
    expect(await fetchNotificationPreferences()).toEqual({ likes: false, replies: true, follows: true });
  });

  it("content real but activity mock: no mock ids reach the list", async () => {
    setRealSlices("auth,content");
    expect(await fetchNotifications(1)).toEqual({ items: [], nextPage: undefined, unreadCount: 0 });
  });
});

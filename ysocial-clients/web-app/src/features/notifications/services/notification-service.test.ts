import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth/store/auth-store";
import { API_BASE_URL } from "@/lib/api-config";
import { mockFetchSequence, problem, setRealSlices, type MockStep } from "@/test/api-test-utils";
import { fetchNotifications, fetchUnreadCount, markAllNotificationsRead, markNotificationRead } from "./notification-service";

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

  it("content real but activity mock: no mock ids reach the list", async () => {
    setRealSlices("auth,content");
    expect(await fetchNotifications(1)).toEqual({ items: [], nextPage: undefined, unreadCount: 0 });
  });
});

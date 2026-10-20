import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth";
import { setRealSlices } from "@/test/api-test-utils";
import type { NotificationPayload } from "@/lib/signalr-client";
import * as service from "../services/notification-service";
import { resetNotificationStore, selectItems, useNotificationStore } from "../store/notification-store";
import { NotificationLiveSync } from "./notification-live-sync";

const hub = vi.hoisted(() => {
  let handler: ((payload: unknown) => void) | null = null;
  let resume: (() => void) | null = null;
  return {
    start: vi.fn(),
    stop: vi.fn(),
    onNotification: vi.fn((next: (payload: unknown) => void) => {
      handler = next;
      return () => {
        handler = null;
      };
    }),
    onResume: vi.fn((next: () => void) => {
      resume = next;
      return () => {
        resume = null;
      };
    }),
    emit: (payload: unknown) => handler?.(payload),
    emitResume: () => resume?.(),
    hasHandler: () => handler !== null,
    hasResume: () => resume !== null,
  };
});
const refresh = vi.hoisted(() => vi.fn());
vi.mock("@/lib/signalr-client", () => ({ notificationHub: hub }));
vi.mock("../store/notification-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../store/notification-store")>()),
  refreshNotifications: refresh,
}));

const blocked = vi.hoisted(() => ({ ids: new Set<string>() }));
const relationListeners = vi.hoisted(() => new Set<() => void>());
vi.mock("@/features/profile", () => ({
  useRelationStore: { subscribe: (listener: () => void) => (relationListeners.add(listener), () => relationListeners.delete(listener)) },
  getViewerRelations: () => ({ blocked: Object.fromEntries([...blocked.ids].map((id) => [id, true])) }),
}));

const SENDER = "22222222-2222-4222-8222-222222222222";
const push = (overrides: Partial<NotificationPayload> = {}): NotificationPayload => ({
  id: "11111111-1111-4111-8111-111111111111",
  type: "NewLike",
  kind: "like",
  createdAt: "2026-10-16T10:00:00Z",
  isRead: false,
  targetId: "33333333-3333-4333-8333-333333333333",
  senderId: SENDER,
  senderName: "Sender",
  senderUsername: "sender",
  ...overrides,
});
/** Marks the `all` list as opened (pushes only land in lists that are loaded). */
const openList = () => useNotificationStore.setState((state) => ({ lists: { ...state.lists, all: { ...state.lists.all, status: "ready" } } }));
const items = () => selectItems(useNotificationStore.getState(), "all");
const signIn = () =>
  useAuthStore.setState({ user: { id: "viewer-1", email: "v@x.dev", username: "v", displayName: "V" }, accessToken: "A1", refreshToken: "R1", isAuthenticated: true });
const signOut = () => useAuthStore.setState({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });

beforeEach(() => {
  vi.spyOn(service, "fetchUnreadCount").mockResolvedValue(0);
  hub.start.mockClear();
  hub.stop.mockClear();
  blocked.ids.clear();
  resetNotificationStore();
  setRealSlices("auth,content,graph,activity");
  signOut();
});
afterEach(() => {
  vi.restoreAllMocks();
  signOut();
});

describe("NotificationLiveSync", () => {
  it("starts only when authenticated & activity is real", () => {
    render(<NotificationLiveSync />);
    expect(hub.start).not.toHaveBeenCalled();

    act(signIn);
    expect(hub.start).toHaveBeenCalledTimes(1);
    expect(hub.start.mock.calls[0][0]()).toBe("A1");
  });

  it("never connects while activity is still mock", () => {
    setRealSlices("auth,content,graph");
    signIn();
    render(<NotificationLiveSync />);
    expect(hub.start).not.toHaveBeenCalled();
  });

  it("token factory reads the current token (rotation)", () => {
    signIn();
    render(<NotificationLiveSync />);
    act(() => useAuthStore.setState({ accessToken: "A2" }));
    expect(hub.start.mock.calls[0][0]()).toBe("A2");
  });

  it("stops & clears the list on logout", () => {
    signIn();
    openList();
    render(<NotificationLiveSync />);
    act(() => hub.emit(push()));
    expect(items()).toHaveLength(1);

    act(signOut);
    expect(hub.stop).toHaveBeenCalled();
    expect(useNotificationStore.getState().byId).toEqual({});
  });

  it("push inserts the item at the top & bumps unread", () => {
    signIn();
    openList();
    render(<NotificationLiveSync />);
    act(() => hub.emit(push({ id: "a1111111-1111-4111-8111-111111111111" })));
    act(() => hub.emit(push({ id: "b1111111-1111-4111-8111-111111111111", type: "NewFollow", kind: "follow", targetId: null })));
    expect(items().map((entry) => entry.kind)).toEqual(["follow", "like"]);
    expect(useNotificationStore.getState().unreadCount).toBe(2);
  });

  it("duplicate push for the same id is ignored", () => {
    signIn();
    openList();
    render(<NotificationLiveSync />);
    act(() => hub.emit(push()));
    act(() => hub.emit(push()));
    expect(items()).toHaveLength(1);
    expect(useNotificationStore.getState().unreadCount).toBe(1);
  });

  it("unknown type still renders generic (kind other)", () => {
    signIn();
    openList();
    render(<NotificationLiveSync />);
    act(() => hub.emit(push({ type: "Brand", kind: "weird", message: "hi" })));
    expect(items()[0]).toMatchObject({ kind: "other", message: "hi" });
  });

  it("push from a sender the viewer blocked is never shown", () => {
    blocked.ids.add(SENDER);
    signIn();
    openList();
    render(<NotificationLiveSync />);
    act(() => hub.emit(push()));
    expect(items()).toEqual([]);
  });

  it("blocking a sender removes their items from the open list & recounts unread", () => {
    signIn();
    openList();
    render(<NotificationLiveSync />);
    act(() => hub.emit(push()));
    act(() => hub.emit(push({ id: "a1111111-1111-4111-8111-111111111111", senderId: "44444444-4444-4444-8444-444444444444" })));
    expect(useNotificationStore.getState().unreadCount).toBe(2);

    blocked.ids.add(SENDER);
    act(() => relationListeners.forEach((listener) => listener()));
    expect(items()).toHaveLength(1);
    expect(useNotificationStore.getState().unreadCount).toBe(1);
  });

  it("a malformed push (no id) is dropped without breaking the stream", () => {
    signIn();
    openList();
    render(<NotificationLiveSync />);
    act(() => hub.emit(push({ id: undefined })));
    act(() => hub.emit(push()));
    expect(items()).toHaveLength(1);
  });

  it("a resumed socket refreshes the list once (catch-up), and stops listening on unmount", () => {
    refresh.mockClear();
    signIn();
    const { unmount } = render(<NotificationLiveSync />);
    act(() => hub.emitResume());
    expect(refresh).toHaveBeenCalledTimes(1);
    unmount();
    expect(hub.hasResume()).toBe(false);
  });

  it("loads the unread count at once for a signed-in viewer (the nav badge needs it before the page is opened)", async () => {
    vi.spyOn(service, "fetchUnreadCount").mockResolvedValue(5);
    signIn();
    render(<NotificationLiveSync />);
    await vi.waitFor(() => expect(useNotificationStore.getState().unreadCount).toBe(5));
  });

  it("mock mode: the count still loads, the hub never starts, logout still drops the state", async () => {
    setRealSlices("none");
    vi.spyOn(service, "fetchUnreadCount").mockResolvedValue(3);
    signIn();
    render(<NotificationLiveSync />);
    await vi.waitFor(() => expect(useNotificationStore.getState().unreadCount).toBe(3));
    expect(hub.start).not.toHaveBeenCalled();
    act(signOut);
    expect(useNotificationStore.getState().unreadCount).toBe(0);
  });

  it("a guest makes no count request", () => {
    const spy = vi.spyOn(service, "fetchUnreadCount");
    render(<NotificationLiveSync />);
    expect(spy).not.toHaveBeenCalled();
  });

  it("blocking re-syncs the count once for several new blocks; unblocking re-syncs again (their rows are back in the BE count)", async () => {
    const spy = vi.spyOn(service, "fetchUnreadCount").mockResolvedValue(0);
    signIn();
    render(<NotificationLiveSync />);
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1));

    blocked.ids.add(SENDER);
    blocked.ids.add("44444444-4444-4444-8444-444444444444");
    act(() => relationListeners.forEach((listener) => listener()));
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(2));

    blocked.ids.delete(SENDER);
    act(() => relationListeners.forEach((listener) => listener()));
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(3));
  });

  it("unsubscribes on unmount", () => {
    signIn();
    const { unmount } = render(<NotificationLiveSync />);
    unmount();
    expect(hub.hasHandler()).toBe(false);
    expect(hub.stop).toHaveBeenCalled();
  });
});

import { create } from "zustand";
import { useAuthStore } from "@/features/auth";
import { isRealApi } from "@/lib/api-config";
import { fetchNotifications, markAllNotificationsRead, markNotificationRead } from "../services/notification-service";
import type { NotificationItemData, NotificationPage } from "../types";

// Single list shared by the notifications page and the SignalR push (Providers): HTTP pages & live items land in
// the same state. Commits are optimistic and roll back on rejection; a reset (logout, account switch) drops any
// response still in flight.

interface NotificationState {
  items: NotificationItemData[];
  unreadCount: number;
  nextPage?: number;
  status: "idle" | "loading" | "ready" | "error";
  loadingMore: boolean;
}

const INITIAL: NotificationState = { items: [], unreadCount: 0, nextPage: undefined, status: "idle", loadingMore: false };

export const useNotificationStore = create<NotificationState>(() => ({ ...INITIAL }));

const set = useNotificationStore.setState;
const get = useNotificationStore.getState;

/** Bumped by every reset: a load started before it is stale. */
let generation = 0;

/** Drops the list & any in-flight response (logout, account switch, tests). */
export function resetNotificationStore(): void {
  generation += 1;
  set({ ...INITIAL });
}

const mergeUnique = (current: NotificationItemData[], incoming: NotificationItemData[]): NotificationItemData[] => {
  const known = new Set(current.map((entry) => entry.id));
  return [...current, ...incoming.filter((entry) => !known.has(entry.id))];
};

/** Real list needs a signed-in viewer; a guest sees an empty list without a request. */
const isGuestOnRealList = (): boolean => isRealApi("activity") && !useAuthStore.getState().isAuthenticated;

export async function loadNotifications(): Promise<void> {
  if (isGuestOnRealList()) {
    set({ ...INITIAL, status: "ready" });
    return;
  }
  const started = generation;
  set({ status: "loading" });
  let page: NotificationPage;
  try {
    page = await fetchNotifications(1);
  } catch {
    if (generation === started) set({ status: "error" });
    return;
  }
  if (generation !== started) return;
  // Items pushed while the request was in flight stay on top
  set((state) => ({
    items: mergeUnique(state.items, page.items),
    unreadCount: page.unreadCount,
    nextPage: page.nextPage,
    status: "ready",
  }));
}

/**
 * Catch-up after the live socket was down: page 1 again, missed items go on top, the BE unread count wins. Silent:
 * no status change, failures ignored, and nothing happens before the page's own first load.
 */
export async function refreshNotifications(): Promise<void> {
  if (get().status !== "ready") return;
  const started = generation;
  let page: NotificationPage;
  try {
    page = await fetchNotifications(1);
  } catch {
    return;
  }
  if (generation !== started) return;
  set((state) => {
    const known = new Set(state.items.map((entry) => entry.id));
    return { items: [...page.items.filter((entry) => !known.has(entry.id)), ...state.items], unreadCount: page.unreadCount };
  });
}

export async function loadMoreNotifications(): Promise<void> {
  const { nextPage, loadingMore } = get();
  if (nextPage === undefined || loadingMore) return;
  const started = generation;
  set({ loadingMore: true });
  try {
    const page = await fetchNotifications(nextPage);
    if (generation !== started) return;
    set((state) => ({ items: mergeUnique(state.items, page.items), nextPage: page.nextPage, loadingMore: false }));
  } catch {
    if (generation === started) set({ loadingMore: false });
  }
}

/** Marks one notification read at once; false (and reverted) when the service rejects. No-op for a read/unknown item. */
export async function commitMarkRead(id: string): Promise<boolean> {
  const target = get().items.find((entry) => entry.id === id);
  if (!target || target.isRead) return true;

  const started = generation;
  set((state) => ({
    items: state.items.map((entry) => (entry.id === id ? { ...entry, isRead: true } : entry)),
    unreadCount: Math.max(0, state.unreadCount - 1),
  }));
  try {
    await markNotificationRead(id);
    return true;
  } catch {
    if (generation === started) {
      set((state) => ({
        items: state.items.map((entry) => (entry.id === id ? { ...entry, isRead: false } : entry)),
        unreadCount: state.unreadCount + 1,
      }));
    }
    return false;
  }
}

export async function commitMarkAllRead(): Promise<boolean> {
  const started = generation;
  const before = get();
  const previouslyUnread = new Set(before.items.filter((entry) => !entry.isRead).map((entry) => entry.id));
  set((state) => ({ items: state.items.map((entry) => ({ ...entry, isRead: true })), unreadCount: 0 }));
  try {
    await markAllNotificationsRead();
    return true;
  } catch {
    if (generation === started) {
      set((state) => ({
        items: state.items.map((entry) => (previouslyUnread.has(entry.id) ? { ...entry, isRead: false } : entry)),
        unreadCount: before.unreadCount,
      }));
    }
    return false;
  }
}

/** Live item at the top (SignalR). False when it is already in the list. */
export function pushNotification(item: NotificationItemData): boolean {
  if (get().items.some((entry) => entry.id === item.id)) return false;
  set((state) => ({
    items: [item, ...state.items],
    unreadCount: state.unreadCount + (item.isRead ? 0 : 1),
  }));
  return true;
}

/** Mock only: flips the follow-back state of every item of `userId` (real items carry no follow state). */
export function toggleNotificationFollow(userId: string): void {
  set((state) => ({
    items: state.items.map((entry) =>
      entry.user.id === userId && entry.user.isFollowing !== undefined
        ? { ...entry, user: { ...entry.user, isFollowing: !entry.user.isFollowing } }
        : entry,
    ),
  }));
}

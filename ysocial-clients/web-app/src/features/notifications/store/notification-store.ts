import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { useAuthStore } from "@/features/auth";
import { isRealApi } from "@/lib/api-config";
import { resetPreferencesStore } from "./notification-preferences-store";
import {
  fetchNotifications,
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
} from "../services/notification-service";
import type { NotificationFilter, NotificationItemData, NotificationKind, NotificationPage } from "../types";

// One record per notification (`byId`) shared by one id list per filter tab: HTTP pages & live pushes land in the same
// state, reading an item in one tab reads it everywhere. Commits are optimistic and roll back on rejection; a reset
// (logout, account switch) drops any response still in flight.
//
// Unread count: the server is authoritative. The client changes it in exactly two ways (-1 on a single mark-read,
// +1 on a push) and every local change bumps `countSeq`, so an answer that started before it is never applied
// (it would overwrite the change) and is asked again once. Nothing recounts from the loaded, incomplete items.

export interface NotificationListState {
  ids: string[];
  nextPage?: number;
  status: "idle" | "loading" | "ready" | "error";
  loadingMore: boolean;
}

interface NotificationState {
  byId: Record<string, NotificationItemData>;
  lists: Record<NotificationFilter, NotificationListState>;
  unreadCount: number;
}

export const NOTIFICATION_FILTERS: readonly NotificationFilter[] = ["all", "mentions", "replies", "follows", "likes"];

const emptyList = (): NotificationListState => ({ ids: [], nextPage: undefined, status: "idle", loadingMore: false });

const fresh = (): NotificationState => ({
  byId: {},
  lists: { all: emptyList(), mentions: emptyList(), replies: emptyList(), follows: emptyList(), likes: emptyList() },
  unreadCount: 0,
});

export const useNotificationStore = create<NotificationState>(() => fresh());

const set = useNotificationStore.setState;
const get = useNotificationStore.getState;

/** Bumped by every reset: a request started before it is stale. */
let generation = 0;
/** Bumped by every LOCAL change of `unreadCount`: a server count that started before it is stale. */
let countSeq = 0;
/** The mark-all request in flight (shared by every caller until it settles). */
let markAllInFlight: Promise<boolean> | null = null;

/** Drops every list & any in-flight response, preferences included (logout, account switch, tests). */
export function resetNotificationStore(): void {
  resetPreferencesStore();
  generation += 1;
  countSeq += 1;
  markAllInFlight = null;
  set(fresh());
}

const FILTER_BY_KIND: Readonly<Partial<Record<NotificationKind, NotificationFilter>>> = {
  like: "likes",
  reply: "replies",
  follow: "follows",
  mention: "mentions",
};

const time = (item: NotificationItemData | undefined): number => (item ? new Date(item.createdAt).getTime() || 0 : 0);

/** Items of one list, newest first (stable reference per state change through `useShallow`). */
export function selectItems(state: NotificationState, filter: NotificationFilter): NotificationItemData[] {
  const { byId, lists } = state;
  return lists[filter].ids.map((id) => byId[id]).filter((entry): entry is NotificationItemData => entry !== undefined);
}

export const useNotificationItems = (filter: NotificationFilter): NotificationItemData[] =>
  useNotificationStore(useShallow((state) => selectItems(state, filter)));

export const useNotificationList = (filter: NotificationFilter): NotificationListState => useNotificationStore((state) => state.lists[filter]);

export const useUnreadCount = (): number => useNotificationStore((state) => state.unreadCount);

/** Local copy wins on `isRead`: an item can only turn read on the client, and a response may predate that. */
function mergeRecords(current: NotificationState["byId"], incoming: NotificationItemData[]): NotificationState["byId"] {
  const next = { ...current };
  for (const entry of incoming) {
    const known = next[entry.id];
    next[entry.id] = known?.isRead && !entry.isRead ? { ...entry, isRead: true } : entry;
  }
  return next;
}

/** Union of both id lists, newest first: pages arrive out of order relative to pushes that landed meanwhile. */
function mergeIds(byId: NotificationState["byId"], current: string[], incoming: string[]): string[] {
  const union = [...new Set([...current, ...incoming])];
  return union.map((id, index) => ({ id, index })).sort((a, b) => time(byId[b.id]) - time(byId[a.id]) || a.index - b.index).map((entry) => entry.id);
}

const patchList = (state: NotificationState, filter: NotificationFilter, patch: Partial<NotificationListState>): NotificationState["lists"] => ({
  ...state.lists,
  [filter]: { ...state.lists[filter], ...patch },
});

/** Real list needs a signed-in viewer; a guest sees an empty list without a request. */
const isGuestOnRealList = (): boolean => isRealApi("activity") && !useAuthStore.getState().isAuthenticated;

/** `mentions` of the real adapter is an empty stand-in: its count (0) says nothing about the viewer's unread. */
const carriesCount = (filter: NotificationFilter): boolean => !(filter === "mentions" && isRealApi("activity"));

/**
 * Applies a page of `filter` (first page or catch-up). Returns false when its unread count was NOT applied because a
 * local change happened since the request started: the caller then re-syncs.
 */
function applyFirstPage(filter: NotificationFilter, page: NotificationPage, seqAtStart: number, keepNextPage: boolean): boolean {
  const countFresh = countSeq === seqAtStart;
  const applyCount = carriesCount(filter) && countFresh;
  set((state) => {
    const byId = mergeRecords(state.byId, page.items);
    return {
      byId,
      lists: patchList(state, filter, {
        ids: mergeIds(byId, state.lists[filter].ids, page.items.map((entry) => entry.id)),
        nextPage: keepNextPage ? state.lists[filter].nextPage : page.nextPage,
        status: "ready",
      }),
      unreadCount: applyCount ? page.unreadCount : state.unreadCount,
    };
  });
  return !carriesCount(filter) || countFresh;
}

export async function loadNotifications(filter: NotificationFilter = "all"): Promise<void> {
  if (isGuestOnRealList()) {
    const empty = fresh();
    set({ ...empty, lists: patchList(empty, filter, { status: "ready" }) });
    return;
  }
  const started = generation;
  const seqAtStart = countSeq;
  set((state) => ({ lists: patchList(state, filter, { status: "loading" }) }));
  let page: NotificationPage;
  try {
    page = await fetchNotifications(1, filter);
  } catch {
    if (generation === started) set((state) => ({ lists: patchList(state, filter, { status: "error" }) }));
    return;
  }
  if (generation !== started) return;
  // Items pushed while the request was in flight stay on top
  if (!applyFirstPage(filter, page, seqAtStart, false)) void syncUnreadCount();
}

/**
 * Server unread count into the store. An answer is applied only when no local change of the count happened since the
 * request started; otherwise it is dropped & asked once more (a second stale answer is dropped too). Silent on failure.
 */
export async function syncUnreadCount(retry = true): Promise<void> {
  if (isGuestOnRealList()) return;
  const started = generation;
  const seqAtStart = countSeq;
  let count: number;
  try {
    count = await fetchUnreadCount();
  } catch {
    return;
  }
  if (generation !== started) return;
  if (countSeq !== seqAtStart) {
    if (retry) await syncUnreadCount(false);
    return;
  }
  set({ unreadCount: count });
}

/**
 * Catch-up after the live socket was down: page 1 of every loaded list again, missed items go on top. Silent: no
 * status change, failures ignored. With the page never opened only the count is synced.
 */
export async function refreshNotifications(): Promise<void> {
  const loaded = NOTIFICATION_FILTERS.filter((filter) => get().lists[filter].status === "ready");
  if (loaded.length === 0) {
    await syncUnreadCount();
    return;
  }
  const started = generation;
  const seqAtStart = countSeq;
  const pages = await Promise.all(
    loaded.map(async (filter) => {
      try {
        return { filter, page: await fetchNotifications(1, filter) };
      } catch {
        return null;
      }
    }),
  );
  if (generation !== started) return;
  let stale = false;
  for (const result of pages) {
    if (result && !applyFirstPage(result.filter, result.page, seqAtStart, true)) stale = true;
  }
  if (stale) void syncUnreadCount();
}

/** Removes every item from the senders (the viewer just blocked them); the BE hides the unloaded ones, so the count re-syncs once. */
export function dropNotificationsFrom(senderIds: string | readonly string[]): void {
  const senders = new Set(typeof senderIds === "string" ? [senderIds] : senderIds);
  const doomed = new Set(Object.values(get().byId).filter((entry) => senders.has(entry.user.id)).map((entry) => entry.id));
  if (doomed.size > 0) {
    const removedUnread = [...doomed].filter((id) => !get().byId[id].isRead).length;
    countSeq += 1;
    set((state) => {
      const byId = Object.fromEntries(Object.entries(state.byId).filter(([id]) => !doomed.has(id)));
      const lists = Object.fromEntries(
        NOTIFICATION_FILTERS.map((filter) => [filter, { ...state.lists[filter], ids: state.lists[filter].ids.filter((id) => !doomed.has(id)) }]),
      ) as NotificationState["lists"];
      return { byId, lists, unreadCount: Math.max(0, state.unreadCount - removedUnread) };
    });
  }
  void syncUnreadCount();
}

export async function loadMoreNotifications(filter: NotificationFilter = "all"): Promise<void> {
  const { nextPage, loadingMore } = get().lists[filter];
  if (nextPage === undefined || loadingMore) return;
  const started = generation;
  set((state) => ({ lists: patchList(state, filter, { loadingMore: true }) }));
  try {
    const page = await fetchNotifications(nextPage, filter);
    if (generation !== started) return;
    set((state) => {
      const byId = mergeRecords(state.byId, page.items);
      return {
        byId,
        lists: patchList(state, filter, {
          ids: mergeIds(byId, state.lists[filter].ids, page.items.map((entry) => entry.id)),
          nextPage: page.nextPage,
          loadingMore: false,
        }),
      };
    });
  } catch {
    if (generation === started) set((state) => ({ lists: patchList(state, filter, { loadingMore: false }) }));
  }
}

const setRead = (ids: ReadonlySet<string>, isRead: boolean) =>
  set((state) => ({
    byId: Object.fromEntries(Object.entries(state.byId).map(([id, entry]) => [id, ids.has(id) ? { ...entry, isRead } : entry])),
  }));

/** Marks one notification read at once; false (and reverted) when the service rejects. No-op for a read/unknown item. */
export async function commitMarkRead(id: string): Promise<boolean> {
  const target = get().byId[id];
  if (!target || target.isRead) return true;

  const started = generation;
  countSeq += 1;
  setRead(new Set([id]), true);
  set((state) => ({ unreadCount: Math.max(0, state.unreadCount - 1) }));
  try {
    await markNotificationRead(id);
    return true;
  } catch {
    if (generation === started) {
      countSeq += 1;
      setRead(new Set([id]), false);
      set((state) => ({ unreadCount: state.unreadCount + 1 }));
    }
    return false;
  }
}

/**
 * Marks everything the viewer has SEEN read (bounded by the newest loaded item, D28): later arrivals stay unread.
 * One request at a time: concurrent callers (auto-mark on view, the button) share it. On failure only what this call
 * flipped is reverted; the count is never restored from a snapshot, it is re-synced from the server.
 */
export function commitMarkAllRead(): Promise<boolean> {
  if (markAllInFlight) return markAllInFlight;
  const run = markAllRead().finally(() => {
    if (markAllInFlight === run) markAllInFlight = null;
  });
  markAllInFlight = run;
  return run;
}

async function markAllRead(): Promise<boolean> {
  const loaded = Object.values(get().byId);
  const newest = loaded.reduce<NotificationItemData | undefined>((best, entry) => (best === undefined || time(entry) > time(best) ? entry : best), undefined);
  if (!newest) return true;

  const started = generation;
  const bound = time(newest);
  const flipped = new Set(loaded.filter((entry) => !entry.isRead && time(entry) <= bound).map((entry) => entry.id));
  countSeq += 1;
  setRead(flipped, true);
  set((state) => ({ unreadCount: Math.max(0, state.unreadCount - flipped.size) }));
  try {
    await markAllNotificationsRead(newest.id);
  } catch {
    if (generation !== started) return false;
    countSeq += 1;
    setRead(flipped, false);
    set((state) => ({ unreadCount: state.unreadCount + flipped.size }));
    void syncUnreadCount();
    return false;
  }
  // The server also marked older, unloaded rows: its count is the truth now
  if (generation === started) void syncUnreadCount();
  return true;
}

/** Live item at the top of the lists that are loaded for its kind (SignalR). False when it is already known. */
export function pushNotification(item: NotificationItemData): boolean {
  if (get().byId[item.id]) return false;
  countSeq += 1;
  const kindFilter = FILTER_BY_KIND[item.kind];
  set((state) => {
    const targets = (["all", ...(kindFilter ? [kindFilter] : [])] as NotificationFilter[]).filter(
      (filter) => state.lists[filter].status === "ready" || state.lists[filter].status === "loading",
    );
    const lists = { ...state.lists };
    for (const filter of targets) lists[filter] = { ...lists[filter], ids: [item.id, ...lists[filter].ids] };
    return { byId: { ...state.byId, [item.id]: item }, lists, unreadCount: state.unreadCount + (item.isRead ? 0 : 1) };
  });
  return true;
}

/** Mock only: flips the follow-back state of every item of `userId` (real items carry no follow state). */
export function toggleNotificationFollow(userId: string): void {
  set((state) => ({
    byId: Object.fromEntries(
      Object.entries(state.byId).map(([id, entry]) => [
        id,
        entry.user.id === userId && entry.user.isFollowing !== undefined ? { ...entry, user: { ...entry.user, isFollowing: !entry.user.isFollowing } } : entry,
      ]),
    ),
  }));
}

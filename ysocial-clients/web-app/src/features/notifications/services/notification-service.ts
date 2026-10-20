import { apiClient } from "@/lib/api-client";
import { isRealApi } from "@/lib/api-config";
import { isBackendId, requireBackendId } from "@/lib/backend-id";
import { SEED_NOTIFICATIONS } from "../mocks/notification-seed";
import type {
  NotificationFilter,
  NotificationItemData,
  NotificationKind,
  NotificationPage,
  NotificationPageDto,
  NotificationPreferences,
  NotificationPreferencesDto,
} from "../types";
import { toNotificationPage, toNotificationPreferences } from "./notification-mapper";

// Notifications data source (MAP §2.7). Real adapter behind the `activity` slice; the mock adapter serves the seed
// list. With content real but activity mock the list is empty: seed items reference mock users (non-GUID ids).

const PAGE_SIZE = 20;

const isRealList = (): boolean => isRealApi("activity");

/** BE `kind` value per list filter; `mentions` has none (BE has no mention model). */
const BE_KIND: Readonly<Partial<Record<NotificationFilter, string>>> = { likes: "like", replies: "reply", follows: "follow" };

const SEED_KIND: Readonly<Record<Exclude<NotificationFilter, "all">, NotificationKind>> = {
  likes: "like",
  replies: "reply",
  follows: "follow",
  mentions: "mention",
};

const byNewest = (a: { createdAt: string }, b: { createdAt: string }): number => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

/** Mock adapter state: ids the viewer marked read (the seed itself never changes), like a server would remember. */
const mockReadIds = new Set<string>();

/** Seed newest first with the viewer's read marks; empty while content is real (seed users are mock ids). */
const mockSeed = (): NotificationItemData[] =>
  isRealApi("content") ? [] : [...SEED_NOTIFICATIONS].sort(byNewest).map((entry) => (mockReadIds.has(entry.id) ? { ...entry, isRead: true } : entry));

/**
 * One page of the list. `unreadCount` is OVERALL (never per filter), except for the empty `mentions` page of the
 * real adapter, which carries 0: the store applies counts from the `all` list & `fetchUnreadCount` only.
 */
export async function fetchNotifications(page = 1, filter: NotificationFilter = "all"): Promise<NotificationPage> {
  if (isRealList()) {
    // The BE rejects `kind=mention` (400): mentions are mock-only, so there is nothing to ask
    if (filter === "mentions") return { items: [], nextPage: undefined, unreadCount: 0 };
    const kind = BE_KIND[filter];
    return toNotificationPage(
      await apiClient.get<NotificationPageDto>("/api/notifications", { params: { page, pageSize: PAGE_SIZE, ...(kind ? { kind } : {}) } }),
    );
  }
  const seed = mockSeed();
  const items = filter === "all" ? seed : seed.filter((entry) => entry.kind === SEED_KIND[filter]);
  return { items, nextPage: undefined, unreadCount: seed.filter((entry) => !entry.isRead).length };
}

export async function fetchUnreadCount(): Promise<number> {
  if (isRealList()) {
    const result = await apiClient.get<{ count?: number | null }>("/api/notifications/unread-count");
    return result?.count ?? 0;
  }
  return mockSeed().filter((entry) => !entry.isRead).length;
}

/** Idempotent. 403 `NotNotificationRecipient` (foreign notification) & 404 reject as `ApiError`. */
export async function markNotificationRead(id: string): Promise<void> {
  if (isRealList()) await apiClient.put(`/api/notifications/${requireBackendId(id)}/read`);
  else mockReadIds.add(id);
}

/**
 * Marks own notifications read up to & including `upToId` (the newest the viewer has seen), so rows created after
 * that stay unread (D28). Without it every row is marked: only for callers that never saw a list.
 */
export async function markAllNotificationsRead(upToId?: string): Promise<void> {
  if (!isRealList()) {
    const bound = SEED_NOTIFICATIONS.find((entry) => entry.id === upToId);
    for (const entry of SEED_NOTIFICATIONS) if (!bound || byNewest(bound, entry) <= 0) mockReadIds.add(entry.id);
    return;
  }
  await apiClient.put("/api/notifications/read-all", undefined, upToId && isBackendId(upToId) ? { params: { upToId } } : undefined);
}

// #region Preferences (D27)
let mockPreferences: NotificationPreferences = { likes: true, replies: true, follows: true };

/** Tests only: back to the pristine mock adapter (all read marks cleared, preferences all on). */
export function resetMockNotificationState(): void {
  mockPreferences = { likes: true, replies: true, follows: true };
  mockReadIds.clear();
}

export async function fetchNotificationPreferences(): Promise<NotificationPreferences> {
  if (isRealList()) return toNotificationPreferences(await apiClient.get<NotificationPreferencesDto>("/api/notifications/preferences"));
  return { ...mockPreferences };
}

/** Full replace (BE requires every field). Resolves with what the server stored. */
export async function saveNotificationPreferences(preferences: NotificationPreferences): Promise<NotificationPreferences> {
  if (isRealList()) {
    return toNotificationPreferences(await apiClient.put<NotificationPreferencesDto>("/api/notifications/preferences", preferences));
  }
  mockPreferences = { ...preferences };
  return { ...mockPreferences };
}
// #endregion

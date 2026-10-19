import { apiClient } from "@/lib/api-client";
import { isRealApi } from "@/lib/api-config";
import { requireBackendId } from "@/lib/backend-id";
import { SEED_NOTIFICATIONS } from "../mocks/notification-seed";
import type { NotificationPage, NotificationPageDto } from "../types";
import { toNotificationPage } from "./notification-mapper";

// Notifications data source (MAP §2.7). Real adapter behind the `activity` slice; the mock adapter serves the seed
// list. With content real but activity mock the list is empty: seed items reference mock users (non-GUID ids).

const PAGE_SIZE = 20;

const isRealList = (): boolean => isRealApi("activity");

export async function fetchNotifications(page = 1): Promise<NotificationPage> {
  if (isRealList()) {
    return toNotificationPage(await apiClient.get<NotificationPageDto>("/api/notifications", { params: { page, pageSize: PAGE_SIZE } }));
  }
  const items = isRealApi("content") ? [] : SEED_NOTIFICATIONS;
  return { items, nextPage: undefined, unreadCount: items.filter((entry) => !entry.isRead).length };
}

export async function fetchUnreadCount(): Promise<number> {
  if (isRealList()) {
    const result = await apiClient.get<{ count?: number | null }>("/api/notifications/unread-count");
    return result?.count ?? 0;
  }
  return isRealApi("content") ? 0 : SEED_NOTIFICATIONS.filter((entry) => !entry.isRead).length;
}

/** Idempotent. 403 `NotNotificationRecipient` (foreign notification) & 404 reject as `ApiError`. */
export async function markNotificationRead(id: string): Promise<void> {
  if (isRealList()) await apiClient.put(`/api/notifications/${requireBackendId(id)}/read`);
}

export async function markAllNotificationsRead(): Promise<void> {
  if (isRealList()) await apiClient.put("/api/notifications/read-all");
}

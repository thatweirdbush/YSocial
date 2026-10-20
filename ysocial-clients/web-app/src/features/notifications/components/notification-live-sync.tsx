"use client";

import { useEffect } from "react";
import { useAuthStore, useIsAuthenticated, useViewerId } from "@/features/auth";
import { getViewerRelations, useRelationStore } from "@/features/profile";
import { isRealApi } from "@/lib/api-config";
import { notificationHub, type NotificationPayload } from "@/lib/signalr-client";
import { toNotificationItem } from "../services/notification-mapper";
import {
  dropNotificationsFrom,
  pushNotification,
  refreshNotifications,
  resetNotificationStore,
  syncUnreadCount,
} from "../store/notification-store";

const getAccessToken = (): string | null => useAuthStore.getState().accessToken;

/**
 * Keeps the shared notification state alive for a signed-in viewer (mounted once in `Providers`): the unread count is
 * loaded at once (the nav badge needs it before the page is ever opened) in both API modes; with the activity slice
 * real the SignalR push joins the lists too. Logout or account switch stops the hub & drops everything. The hub reads
 * the CURRENT access token on every reconnect, so refresh needs no restart.
 */
export function NotificationLiveSync() {
  const isAuthenticated = useIsAuthenticated();
  const viewerId = useViewerId();

  useEffect(() => {
    if (!isAuthenticated) return;
    void syncUnreadCount();
    if (!isRealApi("activity")) return () => resetNotificationStore();

    const off = notificationHub.onNotification((payload: NotificationPayload) => {
      // A sender the viewer blocked is never shown (the BE filters too; this covers a block made after the push)
      if (payload.senderId && viewerId && getViewerRelations(viewerId)?.blocked[payload.senderId]) return;
      try {
        pushNotification(toNotificationItem(payload));
      } catch {
        // Malformed push (contract breach): dropped, the stream keeps working
      }
    });
    // Blocking someone removes their items from the open lists at once (the BE filters them on the next load) and
    // re-syncs the count; unblocking brings their rows back into the BE count, so it re-syncs too
    const dropped = new Set<string>();
    const offBlocks = useRelationStore.subscribe(() => {
      const blockedIds = Object.keys(viewerId ? (getViewerRelations(viewerId)?.blocked ?? {}) : {});
      // An unblocked id is forgotten, so blocking it again purges again
      let unblocked = false;
      for (const id of dropped) {
        if (blockedIds.includes(id)) continue;
        dropped.delete(id);
        unblocked = true;
      }
      if (unblocked) void syncUnreadCount();
      const fresh = blockedIds.filter((id) => !dropped.has(id));
      for (const id of fresh) dropped.add(id);
      if (fresh.length > 0) dropNotificationsFrom(fresh);
    });
    const offResume = notificationHub.onResume(() => void refreshNotifications());
    notificationHub.start(getAccessToken);

    return () => {
      off();
      offResume();
      offBlocks();
      notificationHub.stop();
      resetNotificationStore();
    };
  }, [isAuthenticated, viewerId]);

  return null;
}

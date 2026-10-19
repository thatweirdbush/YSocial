"use client";

import { useEffect } from "react";
import { useAuthStore, useIsAuthenticated, useViewerId } from "@/features/auth";
import { getViewerRelations, useRelationStore } from "@/features/profile";
import { isRealApi } from "@/lib/api-config";
import { notificationHub, type NotificationPayload } from "@/lib/signalr-client";
import { toNotificationItem } from "../services/notification-mapper";
import { dropNotificationsFrom, pushNotification, refreshNotifications, resetNotificationStore } from "../store/notification-store";

const getAccessToken = (): string | null => useAuthStore.getState().accessToken;

/**
 * Keeps the SignalR push in the shared notification list (mounted once in `Providers`). Connects only for a signed-in
 * viewer with the activity slice real; logout or account switch stops the hub & drops the list. The hub reads the
 * CURRENT access token on every reconnect, so refresh needs no restart.
 */
export function NotificationLiveSync() {
  const isAuthenticated = useIsAuthenticated();
  const viewerId = useViewerId();

  useEffect(() => {
    if (!isRealApi("activity") || !isAuthenticated) return;

    const off = notificationHub.onNotification((payload: NotificationPayload) => {
      // A sender the viewer blocked is never shown (the BE filters too; this covers a block made after the push)
      if (payload.senderId && viewerId && getViewerRelations(viewerId)?.blocked[payload.senderId]) return;
      try {
        pushNotification(toNotificationItem(payload));
      } catch {
        // Malformed push (contract breach): dropped, the stream keeps working
      }
    });
    // Blocking someone removes their items from the open list at once (the BE filters them on the next load)
    const dropped = new Set<string>();
    const offBlocks = useRelationStore.subscribe(() => {
      const blockedIds = Object.keys(viewerId ? (getViewerRelations(viewerId)?.blocked ?? {}) : {});
      // An unblocked id is forgotten, so blocking it again purges again
      for (const id of dropped) if (!blockedIds.includes(id)) dropped.delete(id);
      for (const id of blockedIds) {
        if (dropped.has(id)) continue;
        dropped.add(id);
        dropNotificationsFrom(id);
      }
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

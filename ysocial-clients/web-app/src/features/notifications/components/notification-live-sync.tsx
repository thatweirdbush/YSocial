"use client";

import { useEffect } from "react";
import { useAuthStore, useIsAuthenticated, useViewerId } from "@/features/auth";
import { getViewerRelations } from "@/features/profile";
import { isRealApi } from "@/lib/api-config";
import { notificationHub, type NotificationPayload } from "@/lib/signalr-client";
import { toNotificationItem } from "../services/notification-mapper";
import { pushNotification, resetNotificationStore } from "../store/notification-store";

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
    notificationHub.start(getAccessToken);

    return () => {
      off();
      notificationHub.stop();
      resetNotificationStore();
    };
  }, [isAuthenticated, viewerId]);

  return null;
}

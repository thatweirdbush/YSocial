"use client";

import React, { useEffect } from "react";
import { toast } from "sonner";
import { SafeHydration } from "@/components/shared/safe-hydration";
import { Button } from "@/components/ui/button";
import { useIsAuthenticated, useViewerId } from "@/features/auth";
import { FollowRequestsBanner } from "@/features/profile";
import { useTranslation } from "@/hooks/use-translation";
import { hasCapability } from "@/lib/capabilities";
import {
  commitMarkAllRead,
  commitMarkRead,
  loadMoreNotifications,
  loadNotifications,
  toggleNotificationFollow,
  useNotificationStore,
} from "../store/notification-store";
import type { NotificationItemData, NotificationUser } from "../types";
import { NotificationList } from "./notification-list";

export const NotificationContainer: React.FC = () => {
  const { t } = useTranslation();
  const items = useNotificationStore((state) => state.items);
  const unreadCount = useNotificationStore((state) => state.unreadCount);
  const nextPage = useNotificationStore((state) => state.nextPage);
  const status = useNotificationStore((state) => state.status);
  const loadingMore = useNotificationStore((state) => state.loadingMore);

  const isAuthenticated = useIsAuthenticated();
  const viewerId = useViewerId();

  // First page on mount & whenever the viewer changes (hydration, login, account switch); pushed items & later
  // pages share the same store state
  useEffect(() => {
    void loadNotifications();
  }, [isAuthenticated, viewerId]);

  const handleFollowToggle = (user: NotificationUser) => {
    toggleNotificationFollow(user.id);
    if (user.isFollowing) {
      toast.info(`${t("card.unfollow")} @${user.username}`);
    } else {
      toast.success(`${t("card.following")} @${user.username}`);
    }
  };

  const handleOpen = (item: NotificationItemData) => {
    if (item.isRead) return;
    void commitMarkRead(item.id).then((ok) => {
      if (!ok) toast.error(t("common.error"));
    });
  };

  const handleMarkAll = () => {
    void commitMarkAllRead().then((ok) => {
      if (!ok) toast.error(t("common.error"));
    });
  };

  const footer =
    nextPage !== undefined && !loadingMore ? (
      <div className="flex justify-center py-4">
        <Button type="button" variant="outline" onClick={() => void loadMoreNotifications()} className="min-h-11 rounded-full px-5">
          {t("notifications.loadMore")}
        </Button>
      </div>
    ) : null;

  return (
    <SafeHydration>
      <div className="w-full border-zinc-100 dark:border-zinc-900 bg-white dark:bg-black min-h-screen flex flex-col">
        {/* Title Header */}
        <div className="flex items-center justify-between gap-3 px-6 py-5">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            {t("notifications.title")}
          </h1>
          {unreadCount > 0 && (
            <Button type="button" variant="ghost" onClick={handleMarkAll} className="min-h-11 rounded-full px-4 text-sm">
              {t("notifications.markAllRead")}
            </Button>
          )}
        </div>

        {/* Pending follow requests of a private account (hidden when there are none) */}
        {hasCapability("followRequestsUi") && <FollowRequestsBanner />}

        {status === "error" && items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 px-4 py-20 text-center">
            <p className="text-sm font-medium text-zinc-400 dark:text-zinc-500">{t("notifications.loadError")}</p>
            <Button type="button" variant="outline" onClick={() => void loadNotifications()} className="min-h-11 rounded-full px-5">
              {t("notifications.retry")}
            </Button>
          </div>
        ) : (
          <NotificationList items={items} onFollowToggle={handleFollowToggle} onOpen={handleOpen} footer={footer} />
        )}
      </div>
    </SafeHydration>
  );
};

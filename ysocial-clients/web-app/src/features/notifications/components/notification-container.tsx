"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
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
  NOTIFICATION_FILTERS,
  toggleNotificationFollow,
  useNotificationItems,
  useNotificationList,
  useNotificationStore,
  useUnreadCount,
} from "../store/notification-store";
import type { NotificationFilter, NotificationItemData, NotificationUser } from "../types";
import { NotificationList } from "./notification-list";

/** Ids of the loaded items the viewer has not read yet. */
const useUnreadLoadedIds = (): string[] =>
  useNotificationStore(useShallow((state) => Object.values(state.byId).filter((entry) => !entry.isRead).map((entry) => entry.id)));

const isVisible = (): boolean => typeof document === "undefined" || document.visibilityState === "visible";

export const NotificationContainer: React.FC = () => {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const items = useNotificationItems(filter);
  const list = useNotificationList(filter);
  const unreadCount = useUnreadCount();
  const unreadIds = useUnreadLoadedIds();
  const unreadLoaded = unreadIds.length;
  const allReady = useNotificationStore((state) => state.lists.all.status === "ready");

  const isAuthenticated = useIsAuthenticated();
  const viewerId = useViewerId();

  const filters = useMemo(
    () => NOTIFICATION_FILTERS.filter((name) => name !== "mentions" || hasCapability("mentionNotifications")),
    [],
  );

  // Rows unread when seen first: they keep their highlight while the page is open, though they are marked read.
  // Derived while rendering (React's "adjust state on render"): the set grows BEFORE the effect below flips them,
  // and a StrictMode double render or double effect cannot lose it
  const [freshIds, setFreshIds] = useState<ReadonlySet<string>>(() => new Set());
  if (unreadIds.some((id) => !freshIds.has(id))) setFreshIds(new Set([...freshIds, ...unreadIds]));
  // Bumped when the tab becomes visible again or a mark-all succeeded (an item may have arrived meanwhile)
  const [visitTick, setVisitTick] = useState(0);

  // First page of the active tab on mount & whenever the tab or the viewer changes (hydration, login, account
  // switch); pushed items & later pages share the same store state
  useEffect(() => {
    void loadNotifications(filter);
  }, [filter, isAuthenticated, viewerId]);

  // Mark-on-view (X model): everything the viewer is looking at counts as read. Bounded by the newest LOADED item, so
  // anything newer on the server stays unread; hidden tabs keep their pushes unread until they are shown again
  useEffect(() => {
    const onVisible = () => {
      if (isVisible()) setVisitTick((tick) => tick + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !allReady || unreadLoaded === 0 || !isVisible()) return;
    void commitMarkAllRead().then((ok) => {
      // A push that landed while the request was in flight is above its bound: look again once it is done
      if (ok) setVisitTick((tick) => tick + 1);
    });
  }, [isAuthenticated, allReady, unreadLoaded, visitTick]);

  const handleFollowToggle = (user: NotificationUser) => {
    toggleNotificationFollow(user.id);
    if (user.isFollowing) {
      toast.info(`${t("card.unfollow")} @${user.username}`);
    } else {
      toast.success(`${t("card.following")} @${user.username}`);
    }
  };

  const handleOpen = (opened: NotificationItemData[]) => {
    for (const entry of opened) {
      if (entry.isRead) continue;
      void commitMarkRead(entry.id).then((ok) => {
        if (!ok) toast.error(t("common.error"));
      });
    }
  };

  const handleMarkAll = () => {
    void commitMarkAllRead().then((ok) => {
      if (!ok) toast.error(t("common.error"));
    });
  };

  const footer =
    list.nextPage !== undefined && !list.loadingMore ? (
      <div className="flex justify-center py-4">
        <Button type="button" variant="outline" onClick={() => void loadMoreNotifications(filter)} className="min-h-11 rounded-full px-5">
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

        <NotificationList
          filter={filter}
          onFilterChange={setFilter}
          filters={filters}
          items={items}
          status={list.status}
          onRetry={() => void loadNotifications(filter)}
          onFollowToggle={handleFollowToggle}
          onOpen={handleOpen}
          freshIds={freshIds}
          footer={footer}
        />
      </div>
    </SafeHydration>
  );
};

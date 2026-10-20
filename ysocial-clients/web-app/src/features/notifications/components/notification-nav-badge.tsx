"use client";

import React from "react";
import { useIsAuthenticated } from "@/features/auth";
import { useTranslation } from "@/hooks/use-translation";
import { useUnreadCount } from "../store/notification-store";

const MAX_SHOWN = 99;

/**
 * Unread pill for the notifications nav icon (place inside a `relative` wrapper). Absolutely positioned, so it never
 * shifts the layout; the count is also spoken as part of the link's name. Hidden for guests and at zero.
 */
export const NotificationNavBadge: React.FC = () => {
  const { t } = useTranslation();
  const isAuthenticated = useIsAuthenticated();
  const count = useUnreadCount();
  if (!isAuthenticated || count <= 0) return null;

  return (
    <>
      <span
        aria-hidden="true"
        className="absolute -top-1.5 -right-2 min-w-4.5 h-4.5 px-1 rounded-full bg-blue-500 text-white text-[10px] font-bold leading-none flex items-center justify-center ring-2 ring-white dark:ring-black"
      >
        {count > MAX_SHOWN ? `${MAX_SHOWN}+` : count}
      </span>
      <span className="sr-only">{t("notifications.unreadCount", { count })}</span>
    </>
  );
};

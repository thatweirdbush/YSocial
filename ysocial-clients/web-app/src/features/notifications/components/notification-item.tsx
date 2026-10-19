"use client";

import React from "react";
import Link from "next/link";
import { Heart, User, MessageCircle } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/use-translation";
import type { NotificationItemData, NotificationUser } from "../types";

interface NotificationItemProps {
  item: NotificationItemData;
  onFollowToggle: (user: NotificationUser) => void;
  /** Called when the item is opened (marks it read). */
  onOpen?: (item: NotificationItemData) => void;
}

export const NotificationItem: React.FC<NotificationItemProps> = ({
  item,
  onFollowToggle,
  onOpen,
}) => {
  const { t } = useTranslation();

  // Determine redirection path
  const redirectUrl = (() => {
    if (item.kind === "follow") return item.user.username ? `/@${item.user.username}` : "/notifications";
    if (item.kind === "other") return "/notifications";
    return `/posts/${item.postId || ""}`;
  })();

  // ISO timestamps (real) are shown relative; mock seed strings are already display text
  const formatTime = (value: string) => {
    const created = new Date(value).getTime();
    if (Number.isNaN(created)) return value;
    const minutes = Math.max(1, Math.floor((new Date().getTime() - created) / 60000));
    if (minutes < 60) return t("card.minutesAgo", { n: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t("card.hoursAgo", { n: hours });
    return t("card.daysAgo", { n: Math.floor(hours / 24) });
  };

  // Get action text localized
  const getActionText = () => {
    switch (item.kind) {
      case "like":
        return t("notifications.actionLike");
      case "follow":
        if (item.type === "FollowRequested") return t("notifications.actionFollowRequested");
        if (item.type === "FollowAccepted") return t("notifications.actionFollowAccepted");
        return t("notifications.actionFollow");
      case "reply":
        return t("notifications.actionReply");
      default:
        return item.message ?? "";
    }
  };


  // Render type-specific badge overlap icon
  const overlapIconClass = `absolute -bottom-1 -right-1 bg-white dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-900 rounded-full p-1 shadow-xs flex items-center justify-center`;
  const renderOverlapIcon = () => {
    switch (item.kind) {
      case "like":
        return (
          <div className={overlapIconClass}>
            <Heart className="size-3 fill-red-500 text-red-500" />
          </div>
        );
      case "follow":
        return (
          <div className={overlapIconClass}>
            <User className="size-3 fill-blue-500 text-blue-500" />
          </div>
        );
      case "reply":
        return (
          <div className={overlapIconClass}>
            <MessageCircle className="size-3 fill-zinc-500 text-zinc-500" />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="relative px-4 py-4 flex gap-4 items-center justify-between
                    after:absolute after:bottom-0 after:left-18 after:right-0 
                    after:border-b after:border-zinc-200/80 dark:after:border-zinc-900/40"
    >
      <div className="w-full flex gap-4 items-center justify-between">
        <Link href={redirectUrl} onClick={() => onOpen?.(item)} className="flex gap-4 items-start flex-1 min-w-0 hover:opacity-95 transition-opacity">
          {/* Left Column: Avatar & Overlap Badge */}
          <div className="relative shrink-0">
            <Avatar className="size-10 border border-zinc-200 dark:border-zinc-900">
              <AvatarImage src={item.user.avatarUrl} alt={item.user.displayName} />
              <AvatarFallback className="bg-zinc-200 dark:bg-zinc-800 text-xs font-semibold">
                {item.user.displayName.charAt(0) || "U"}
              </AvatarFallback>
            </Avatar>
            {renderOverlapIcon()}
          </div>

          {/* Middle Column: Text Information */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="text-sm">
              <span className="font-semibold text-zinc-900 dark:text-zinc-100 mr-1.5 hover:underline">
                {item.user.displayName}
              </span>
              <span className="text-zinc-600 dark:text-zinc-400">
                {getActionText()}
              </span>
            </div>

            {/* Reply Content Preview */}
            {item.kind === "reply" && item.postContentPreview && (
              <div className="border-l-2 border-zinc-200 dark:border-zinc-800 pl-2 mt-1.5 text-sm text-zinc-550 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                {item.postContentPreview}
              </div>
            )}

            {/* Timestamp and isRead unread badge */}
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-xs text-zinc-400 dark:text-zinc-500">
                {formatTime(item.createdAt)}
              </span>
              {!item.isRead && (
                <span className="size-1.5 rounded-full bg-blue-500 shrink-0" aria-hidden="true" />
              )}
            </div>
          </div>
        </Link>

        {/* Right Column: Follow Button (with stopPropagation) */}
        {item.kind === "follow" && item.user.isFollowing !== undefined && (
          <Button
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onFollowToggle(item.user);
            }}
            size="sm"
            variant="outline"
            className={`text-[11px] font-bold tracking-tight transition-all duration-300 px-3 py-0.5 rounded-full border shrink-0 ${item.user.isFollowing
              ? "bg-zinc-100 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-450 hover:bg-zinc-200 dark:hover:bg-zinc-850"
              : "bg-transparent border-zinc-950 dark:border-zinc-100 text-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
              }`}
          >
            {item.user.isFollowing ? t("card.following") : t("card.follow")}
          </Button>
        )}
      </div>
    </div>
  );
};

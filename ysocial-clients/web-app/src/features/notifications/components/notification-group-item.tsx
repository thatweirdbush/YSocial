"use client";

import React from "react";
import Link from "next/link";
import { Heart } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useTranslation } from "@/hooks/use-translation";
import type { NotificationItemData } from "../types";
import { formatNotificationTime } from "./format-notification-time";

interface NotificationGroupItemProps {
  /** Likes of one post, newest first, 2 or more (all LOADED ones). */
  items: NotificationItemData[];
  /** Highlight + dot (unread now, or unread when the page was opened). */
  isNew: boolean;
  /** Opening the group marks every member read. */
  onOpen?: (items: NotificationItemData[]) => void;
}

const MAX_AVATARS = 3;

/** "X and N others liked your post": N counts the loaded members only, never the post's real like total. */
export const NotificationGroupItem: React.FC<NotificationGroupItemProps> = ({ items, isNew, onOpen }) => {
  const { t } = useTranslation();
  const [newest] = items;
  const others = items.length - 1;
  const label = others === 1
    ? t("notifications.groupedLikeOne", { name: newest.user.displayName })
    : t("notifications.groupedLike", { name: newest.user.displayName, count: others });

  return (
    <div
      className={`relative px-4 py-4 after:absolute after:bottom-0 after:left-18 after:right-0 after:border-b after:border-zinc-200/80 dark:after:border-zinc-900/40 ${
        isNew ? "bg-zinc-50 dark:bg-zinc-900/30" : ""
      }`}
    >
      <Link
        href={`/posts/${newest.postId ?? ""}`}
        onClick={() => onOpen?.(items)}
        className="flex gap-4 items-start min-w-0 hover:opacity-95 transition-opacity"
      >
        <div className="relative shrink-0 flex items-center -space-x-3" aria-hidden="true">
          {items.slice(0, MAX_AVATARS).map((entry) => (
            <Avatar key={entry.id} className="size-10 border-2 border-white dark:border-black">
              <AvatarImage src={entry.user.avatarUrl} alt="" />
              <AvatarFallback className="bg-zinc-200 dark:bg-zinc-800 text-xs font-semibold">
                {entry.user.displayName.charAt(0) || "U"}
              </AvatarFallback>
            </Avatar>
          ))}
          <div className="absolute -bottom-1 -right-1 bg-white dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-900 rounded-full p-1 flex items-center justify-center">
            <Heart className="size-3 fill-red-500 text-red-500" />
          </div>
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          <div className="text-sm">
            <span className="font-semibold text-zinc-900 dark:text-zinc-100 mr-1.5">{label}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-xs text-zinc-400 dark:text-zinc-500">{formatNotificationTime(newest.createdAt, t)}</span>
            {isNew && <span className="size-1.5 rounded-full bg-blue-500 shrink-0" role="img" aria-label={t("notifications.unread")} />}
          </div>
        </div>
      </Link>
    </div>
  );
};

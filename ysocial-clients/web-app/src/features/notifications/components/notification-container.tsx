"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { FollowRequestsBanner } from "@/features/profile";
import { useTranslation } from "@/hooks/use-translation";
import { SafeHydration } from "@/components/shared/safe-hydration";
import { NotificationList } from "./notification-list";
import { NotificationItemData, NotificationUser } from "../types";

const INITIAL_NOTIFICATIONS: NotificationItemData[] = [
  {
    id: "notif-1",
    kind: "reply",
    user: {
      id: "user-hamy",
      username: "hamy_cute",
      displayName: "Nguyễn Hà My",
      avatarUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=100&q=80",
      isFollowing: true,
    },
    createdAt: "10m ago",
    isRead: false,
    postContentPreview: "Cái này đỉnh thật sự luôn ấy! Lát inbox chỉ mình cách làm nhé.",
    postId: "post-1",
  },
  {
    id: "notif-2",
    kind: "like",
    user: {
      id: "user-minh",
      username: "minh_pvc",
      displayName: "Phan Văn Minh",
      avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=100&q=80",
      isFollowing: false,
    },
    createdAt: "1h ago",
    isRead: false,
    postId: "post-1",
  },
  {
    id: "notif-3",
    kind: "follow",
    user: {
      id: "user-anquoc",
      username: "anquoc.dev",
      displayName: "Trần Anh Quốc",
      avatarUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=100&q=80",
      isFollowing: false,
    },
    createdAt: "3h ago",
    isRead: true,
  },
  {
    id: "notif-4",
    kind: "reply",
    user: {
      id: "user-nam",
      username: "nam_hoang",
      displayName: "Hoàng Nam",
      avatarUrl: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=100&q=80",
      isFollowing: false,
    },
    createdAt: "1d ago",
    isRead: true,
    postContentPreview: "Mình đã chạy thử code và kết quả thật sự bất ngờ! Tốc độ nhanh gấp đôi luôn.",
    postId: "post-2",
  },
  {
    id: "notif-5",
    kind: "follow",
    user: {
      id: "user-maichi",
      username: "maichi_ne",
      displayName: "Mai Chi",
      avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80",
      isFollowing: true,
    },
    createdAt: "2d ago",
    isRead: true,
  },
  {
    id: "notif-6",
    kind: "like",
    user: {
      id: "user-hamy",
      username: "hamy_cute",
      displayName: "Nguyễn Hà My",
      avatarUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=100&q=80",
      isFollowing: true,
    },
    createdAt: "3d ago",
    isRead: true,
    postId: "post-2",
  },
];

export const NotificationContainer: React.FC = () => {
  const { t } = useTranslation();
  const [notifications, setNotifications] = useState<NotificationItemData[]>(INITIAL_NOTIFICATIONS);

  // Dynamic follow toggle action
  const handleFollowToggle = (user: NotificationUser) => {
    setNotifications((prev) =>
      prev.map((item) => {
        if (item.user.id === user.id) {
          const nextFollowing = !item.user.isFollowing;
          return {
            ...item,
            user: {
              ...item.user,
              isFollowing: nextFollowing,
            },
          };
        }
        return item;
      })
    );

    if (user.isFollowing) {
      toast.info(`${t("card.unfollow")} @${user.username}`);
    } else {
      toast.success(`${t("card.following")} @${user.username}`);
    }
  };

  return (
    <SafeHydration>
      <div className="w-full border-zinc-100 dark:border-zinc-900 bg-white dark:bg-black min-h-screen flex flex-col">
        {/* Title Header */}
        <div className="px-6 py-5">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            {t("notifications.title")}
          </h1>
        </div>

        {/* Pending follow requests of a private account (hidden when there are none) */}
        <FollowRequestsBanner />

        {/* Dynamic Notification List */}
        <NotificationList
          items={notifications}
          onFollowToggle={handleFollowToggle}
        />
      </div>
    </SafeHydration>
  );
};

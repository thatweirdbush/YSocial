"use client";

import React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TranslationKey, useTranslation } from "@/hooks/use-translation";
import { NotificationItem } from "./notification-item";
import { NotificationItemData, NotificationUser } from "../types";

export interface NotificationListProps {
  items: NotificationItemData[];
  onFollowToggle: (user: NotificationUser) => void;
  onOpen?: (item: NotificationItemData) => void;
  /** Rendered under the active tab list (load more). */
  footer?: React.ReactNode;
}

export const NotificationList: React.FC<NotificationListProps> = ({
  items,
  onFollowToggle,
  onOpen,
  footer,
}) => {
  const { t } = useTranslation();

  // Filter lists based on type
  const replies = items.filter((item) => item.kind === "reply");
  const likes = items.filter((item) => item.kind === "like");
  const follows = items.filter((item) => item.kind === "follow");

  // Render content lists
  const renderList = (filteredItems: NotificationItemData[], emptyKey: TranslationKey) => {
    if (filteredItems.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
          <p className="text-sm text-zinc-400 dark:text-zinc-500 max-w-xs font-medium">
            {t(emptyKey)}
          </p>
        </div>
      );
    }

    return (
      <div className="flex flex-col">
        {filteredItems.map((item) => (
          <NotificationItem
            key={item.id}
            item={item}
            onFollowToggle={onFollowToggle}
            onOpen={onOpen}
          />
        ))}
        {footer}
      </div>
    );
  };

  const triggerClass = `
    flex items-center justify-center gap-1 rounded-none border-t-0 border-x-0 border-b-2 border-transparent
    bg-transparent outline-none focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:outline-none
    data-[state=active]:!bg-transparent data-[state=active]:!shadow-none data-[state=active]:border-black dark:data-[state=active]:border-white
    text-zinc-400 dark:text-zinc-500 font-medium hover:text-zinc-600 dark:hover:text-zinc-300
    data-[state=active]:text-zinc-900 dark:data-[state=active]:text-zinc-100 data-[state=active]:font-bold transition-colors -mb-[1px]
  `;

  const contentClass = `flex-1 min-h-0 overflow-y-auto`;

  return (
    <Tabs defaultValue="all" className="w-full flex-1 flex flex-col min-h-0">
      {/* Tabs Bar */}
      <div className="sticky top-0 bg-white/80 dark:bg-black/80 backdrop-blur-md z-20 w-full shrink-0">
        <TabsList className="w-full grid grid-cols-4 rounded-none bg-transparent p-0 border-b border-zinc-200/80 dark:border-zinc-900/80 outline-none">
          <TabsTrigger value="all" className={triggerClass}>
            <span className="text-sm">{t("notifications.filterAll")}</span>
          </TabsTrigger>
          <TabsTrigger value="replies" className={triggerClass}>
            <span className="text-sm">{t("notifications.filterReplies")}</span>
          </TabsTrigger>
          <TabsTrigger value="likes" className={triggerClass}>
            <span className="text-sm">{t("notifications.filterLikes")}</span>
          </TabsTrigger>
          <TabsTrigger value="follows" className={triggerClass}>
            <span className="text-sm">{t("notifications.filterFollows")}</span>
          </TabsTrigger>
        </TabsList>
      </div>

      {/* Lists Contents */}
      <TabsContent value="all" className={contentClass}>
        {renderList(items, "notifications.emptyAll")}
      </TabsContent>
      <TabsContent value="replies" className={contentClass}>
        {renderList(replies, "notifications.emptyReplies")}
      </TabsContent>
      <TabsContent value="likes" className={contentClass}>
        {renderList(likes, "notifications.emptyLikes")}
      </TabsContent>
      <TabsContent value="follows" className={contentClass}>
        {renderList(follows, "notifications.emptyFollows")}
      </TabsContent>
    </Tabs>
  );
};

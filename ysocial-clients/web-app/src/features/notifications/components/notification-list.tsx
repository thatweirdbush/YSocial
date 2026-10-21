"use client";

import React, { useMemo } from "react";
import { Bell } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type TranslationKey, useTranslation } from "@/hooks/use-translation";
import { groupNotifications } from "../services/group-notifications";
import type { NotificationFilter, NotificationItemData, NotificationUser } from "../types";
import { NotificationGroupItem } from "./notification-group-item";
import { NotificationItem } from "./notification-item";
import { NotificationSkeleton } from "./notification-skeleton";

export interface NotificationListProps {
  filter: NotificationFilter;
  onFilterChange: (filter: NotificationFilter) => void;
  /** Tabs offered; `mentions` only where the data source can produce them (capability). */
  filters: readonly NotificationFilter[];
  items: NotificationItemData[];
  status: "idle" | "loading" | "ready" | "error";
  onRetry: () => void;
  onFollowToggle: (user: NotificationUser) => void;
  /** Called when an item or a group is opened (marks them read). */
  onOpen?: (items: NotificationItemData[]) => void;
  /** Items unread when the page was opened: they keep their highlight while the page is open. */
  freshIds?: ReadonlySet<string>;
  /** Rendered under the active list (load more). */
  footer?: React.ReactNode;
}

const FILTER_LABEL: Readonly<Record<NotificationFilter, TranslationKey>> = {
  all: "notifications.filterAll",
  mentions: "notifications.filterMentions",
  replies: "notifications.filterReplies",
  follows: "notifications.filterFollows",
  likes: "notifications.filterLikes",
};

const EMPTY_LABEL: Readonly<Record<NotificationFilter, TranslationKey>> = {
  all: "notifications.emptyAll",
  mentions: "notifications.emptyMentions",
  replies: "notifications.emptyReplies",
  follows: "notifications.emptyFollows",
  likes: "notifications.emptyLikes",
};

const triggerClass = `
  flex items-center justify-center gap-1 rounded-none border-t-0 border-x-0 border-b-2 border-transparent
  bg-transparent outline-none focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:outline-none
  data-[state=active]:!bg-transparent data-[state=active]:!shadow-none data-[state=active]:border-black dark:data-[state=active]:border-white
  text-zinc-400 dark:text-zinc-500 font-medium hover:text-zinc-600 dark:hover:text-zinc-300
  data-[state=active]:text-zinc-900 dark:data-[state=active]:text-zinc-100 data-[state=active]:font-bold transition-colors -mb-[1px]
`;

export const NotificationList: React.FC<NotificationListProps> = ({
  filter,
  onFilterChange,
  filters,
  items,
  status,
  onRetry,
  onFollowToggle,
  onOpen,
  freshIds,
  footer,
}) => {
  const { t } = useTranslation();

  // Regrouped from the CURRENT list on every change: pages and pushes need no group bookkeeping
  const rows = useMemo(() => groupNotifications(items), [items]);
  const isNew = (item: NotificationItemData) => !item.isRead || (freshIds?.has(item.id) ?? false);

  const renderBody = () => {
    if (status === "error" && items.length === 0) {
      return (
        <EmptyState
          icon={Bell}
          title={t("notifications.loadError")}
          action={
            <Button type="button" variant="outline" onClick={onRetry} className="min-h-11 rounded-full px-5">
              {t("notifications.retry")}
            </Button>
          }
        />
      );
    }
    if ((status === "idle" || status === "loading") && items.length === 0) return <NotificationSkeleton />;
    if (items.length === 0) return <EmptyState icon={Bell} title={t(EMPTY_LABEL[filter])} />;

    return (
      <div className="flex flex-col">
        {rows.map((row) =>
          row.type === "likeGroup" ? (
            <NotificationGroupItem key={row.key} items={row.items} isNew={row.items.some(isNew)} onOpen={onOpen} />
          ) : (
            <NotificationItem
              key={row.key}
              item={row.item}
              isNew={isNew(row.item)}
              onFollowToggle={onFollowToggle}
              onOpen={onOpen ? (opened) => onOpen([opened]) : undefined}
            />
          ),
        )}
        {footer}
      </div>
    );
  };

  return (
    <Tabs value={filter} onValueChange={(value) => onFilterChange(value as NotificationFilter)} className="w-full flex-1 flex flex-col min-h-0">
      <div className="sticky top-0 bg-white/80 dark:bg-black/80 backdrop-blur-md z-20 w-full shrink-0">
        <TabsList
          className={`w-full grid ${filters.length > 4 ? "grid-cols-5" : "grid-cols-4"} rounded-none bg-transparent p-0 border-b border-zinc-200/80 dark:border-zinc-900/80 outline-none`}
        >
          {filters.map((name) => (
            <TabsTrigger key={name} value={name} className={triggerClass}>
              <span className="text-sm">{t(FILTER_LABEL[name])}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      <TabsContent value={filter} className="flex-1 min-h-0 overflow-y-auto">
        {renderBody()}
      </TabsContent>
    </Tabs>
  );
};

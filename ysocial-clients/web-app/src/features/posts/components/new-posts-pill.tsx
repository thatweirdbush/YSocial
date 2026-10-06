"use client";

import { ArrowUp } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useTranslation } from "@/hooks/use-translation";
import { usePendingFeed } from "../hooks/use-pending-feed";
import { useFeedMeta, usePostActions } from "../store/post-store";
import type { FeedTab } from "../types";
import { scrollFeedToTop } from "../utils/scroll";

interface NewPostsPillProps {
  tab: FeedTab;
  /** Page-1 reload used when the buffer overflowed (merging would skip dropped posts). */
  onRefetch: () => Promise<void>;
}

/** X-style "N new posts" pill floating under the feed header; takes no layout space (no CLS). */
export function NewPostsPill({ tab, onRefetch }: NewPostsPillProps) {
  const { t } = useTranslation();
  const { loaded } = useFeedMeta(tab);
  const { ids, overflow, authors } = usePendingFeed(tab);
  const { flushPending } = usePostActions();
  const visible = loaded && (ids.length > 0 || overflow);

  const handleClick = async () => {
    if (overflow) await onRefetch();
    else flushPending(tab, ids);
    scrollFeedToTop();
  };

  return (
    <div className="sticky top-14 z-10 h-0" aria-live="polite">
      {visible && (
        <div className="absolute inset-x-0 flex justify-center pt-2 pointer-events-none">
          <button
            type="button"
            onClick={() => void handleClick()}
            title={t("feed.newPostsAria")}
            className="pointer-events-auto flex min-h-11 items-center gap-2 rounded-full border border-zinc-200/70 dark:border-zinc-800/70 bg-white/80 dark:bg-zinc-900/80 py-1.5 pl-2 pr-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100 shadow-lg backdrop-blur-md transition-colors hover:bg-white dark:hover:bg-zinc-900 animate-in fade-in slide-in-from-top-2 duration-300 motion-reduce:animate-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/60"
          >
            <ArrowUp className="size-4" aria-hidden="true" />
            {authors.length > 0 && (
              <span className="flex -space-x-2" aria-hidden="true">
                {authors.map((author) => (
                  <Avatar key={author.id} className="size-6 ring-2 ring-white dark:ring-zinc-900">
                    <AvatarImage src={author.avatarUrl} alt="" />
                    <AvatarFallback className="bg-zinc-200 dark:bg-zinc-800 text-[10px] font-semibold">
                      {author.displayName.charAt(0).toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                ))}
              </span>
            )}
            {overflow ? t("feed.newPostsOverflow") : ids.length === 1 ? t("feed.newPostsOne") : t("feed.newPosts", { n: ids.length })}
          </button>
        </div>
      )}
    </div>
  );
}

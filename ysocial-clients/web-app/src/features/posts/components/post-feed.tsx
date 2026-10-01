"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/empty-state";
import { useTranslation } from "@/hooks/use-translation";
import { useCurrentAuthor } from "../hooks/use-current-author";
import { createPost, fetchFeed } from "../services/post-service";
import { useFeedIds, usePost, usePostActions } from "../store/post-store";
import type { CreatePostInput, FeedTab } from "../types";
import { PostCard } from "./post-card";
import { PostCreator } from "./post-creator";
import { PostSkeletonList, PostSkeletonText } from "./post-skeleton";

interface TabStatus {
  loaded: boolean;
  failed: boolean;
  nextPage?: number;
}

const INITIAL_STATUS: Record<FeedTab, TabStatus> = {
  forYou: { loaded: false, failed: false },
  following: { loaded: false, failed: false },
};

/** Subscribes to a single post so a like re-renders only this card. */
function FeedPostCard({ id }: { id: string }) {
  const post = usePost(id);
  return post ? <PostCard post={post} /> : null;
}

export function PostFeed() {
  const { t } = useTranslation();
  const author = useCurrentAuthor();
  const { upsertPosts, setFeedPage, prependPost } = usePostActions();
  const [activeTab, setActiveTab] = useState<FeedTab>("forYou");
  const [status, setStatus] = useState(INITIAL_STATUS);
  const [isFetchingNext, setIsFetchingNext] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  // Tabs whose first page was already requested; guards against duplicate fetches across re-renders.
  const requestedTabsRef = useRef(new Set<FeedTab>());
  const feedIds = useFeedIds(activeTab);
  const tabStatus = status[activeTab];

  /** Loads one page into the store; resolves false on failure. Stable identity (no `t` dependency). */
  const loadPage = useCallback(async (tab: FeedTab, page: number) => {
    try {
      const result = await fetchFeed(tab, page);
      upsertPosts(result.posts);
      setFeedPage(tab, result.posts.map((p) => p.id), page > 1);
      setStatus((prev) => ({ ...prev, [tab]: { loaded: true, failed: false, nextPage: result.nextPage } }));
      return true;
    } catch {
      setStatus((prev) => ({ ...prev, [tab]: { ...prev[tab], loaded: true, failed: true } }));
      return false;
    }
  }, [upsertPosts, setFeedPage]);

  const loadWithFeedback = useCallback((tab: FeedTab, page: number) =>
    loadPage(tab, page).then((ok) => {
      if (!ok) toast.error(t("common.error"));
    }), [loadPage, t]);

  // First load per tab; switching back to a loaded tab reuses the cached ids.
  useEffect(() => {
    if (requestedTabsRef.current.has(activeTab)) return;
    requestedTabsRef.current.add(activeTab);
    void loadWithFeedback(activeTab, 1);
  }, [activeTab, loadWithFeedback]);

  const handleRefresh = () => {
    void loadWithFeedback(activeTab, 1);
  };

  const handleComposerSuccess = async (input: CreatePostInput) => {
    const post = await createPost(input, author);
    prependPost("forYou", post);
  };

  // Infinite scroll observer
  useEffect(() => {
    const target = loadMoreRef.current;
    const nextPage = tabStatus.nextPage;
    if (!target || nextPage === undefined) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting || isFetchingNext) return;
        setIsFetchingNext(true);
        void loadWithFeedback(activeTab, nextPage).finally(() => setIsFetchingNext(false));
      },
      { threshold: 0.1 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [activeTab, tabStatus.nextPage, isFetchingNext, loadWithFeedback]);

  return (
    <div className="flex flex-col w-full min-h-screen pb-20 lg:pb-12 bg-white dark:bg-black">

      {/* Sticky Premium Header Tabs Swapper */}
      <header className="sticky top-0 bg-white/70 dark:bg-black/70 backdrop-blur-md border-b border-zinc-200/60 dark:border-zinc-900/60 flex items-center justify-between z-20 px-4 h-14 shrink-0">
        <div className="flex w-full h-full justify-center">
          <button
            onClick={() => setActiveTab("forYou")}
            className="flex-1 flex flex-col items-center justify-center relative font-bold text-sm transition-colors text-center"
          >
            <span className={`${activeTab === "forYou" ? "text-black dark:text-white" : "text-zinc-400"}`}>
              {t("feed.forYou")}
            </span>
            {activeTab === "forYou" && (
              <div className="absolute bottom-0 h-[3px] w-14 bg-black dark:bg-white rounded-full" />
            )}
          </button>

          <button
            onClick={() => setActiveTab("following")}
            className="flex-1 flex flex-col items-center justify-center relative font-bold text-sm transition-colors text-center"
          >
            <span className={`${activeTab === "following" ? "text-black dark:text-white" : "text-zinc-400"}`}>
              {t("feed.following")}
            </span>
            {activeTab === "following" && (
              <div className="absolute bottom-0 h-[3px] w-16 bg-black dark:bg-white rounded-full" />
            )}
          </button>
        </div>

        {/* Quick status bar sparkle spinner */}
        <button
          onClick={handleRefresh}
          aria-label={t("postDetail.retry")}
          className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-400 hover:text-black dark:hover:text-white transition-transform active:rotate-185 shrink-0"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </header>

      {/* Composition Block */}
      <PostCreator onSuccess={handleComposerSuccess} />

      {/* Infinite Feed Container */}
      <div className="flex flex-col w-full divide-y divide-zinc-200/60 dark:divide-zinc-900/60">
        {!tabStatus.loaded ? (
          /* Enforce Zero CLS Skeletal shimmer list */
          <PostSkeletonList count={4} />
        ) : feedIds.length === 0 ? (
          tabStatus.failed ? (
            <EmptyState
              icon={AlertCircle}
              title={t("postDetail.errorTitle")}
              action={
                <button
                  type="button"
                  onClick={handleRefresh}
                  className="min-h-11 px-5 rounded-full border border-zinc-200 dark:border-zinc-800 text-sm font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
                >
                  {t("postDetail.retry")}
                </button>
              }
            />
          ) : (
            <EmptyState icon={Sparkles} title={t("feed.emptyFeed")} description={t("feed.createCTA")} />
          )
        ) : (
          feedIds.map((id) => <FeedPostCard key={id} id={id} />)
        )}
      </div>

      {/* Intersection Threshold for Infinite Loading */}
      {tabStatus.nextPage !== undefined && (
        <div ref={loadMoreRef} className="w-full flex justify-center py-6">
          {isFetchingNext ? <PostSkeletonText /> : <div className="h-2 w-full" />}
        </div>
      )}
    </div>
  );
}
export default PostFeed;

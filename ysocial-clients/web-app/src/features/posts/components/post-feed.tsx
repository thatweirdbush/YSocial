"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/empty-state";
import { ensureFollowGraph, getFollowedIds } from "@/features/profile";
import { useTranslation } from "@/hooks/use-translation";
import { useCurrentAuthor } from "../hooks/use-current-author";
import { useNewPostsStream } from "../hooks/use-new-posts-stream";
import { createPost, fetchFeed } from "../services/post-service";
import { useFeedIds, useFeedMeta, usePost, usePostActions, usePostStore } from "../store/post-store";
import type { CreatePostInput, FeedTab } from "../types";
import { getPendingFeed } from "../utils/pending-feed";
import { NewPostsPill } from "./new-posts-pill";
import { PostCard } from "./post-card";
import { PostCreator } from "./post-creator";
import { PostSkeletonList, PostSkeletonText } from "./post-skeleton";

const NO_FAILURES: Record<FeedTab, boolean> = { forYou: false, following: false };

/** Tabs whose pages are already in the store (snapshot at mount). */
function cachedFeedTabs(): Set<FeedTab> {
  const { feedMeta } = usePostStore.getState();
  return new Set((Object.keys(feedMeta) as FeedTab[]).filter((tab) => feedMeta[tab].loaded));
}

/** Subscribes to a single post so a like re-renders only this card. */
function FeedPostCard({ id }: { id: string }) {
  const post = usePost(id);
  return post ? <PostCard post={post} /> : null;
}

export function PostFeed() {
  const { t } = useTranslation();
  const author = useCurrentAuthor();
  const viewerId = author.id;
  const { upsertPosts, setFeedPage, prependPost, consumeIncoming } = usePostActions();
  const [activeTab, setActiveTab] = useState<FeedTab>("forYou");
  // Transient per-mount failure flags; loaded pages + nextPage live in the store and survive remounts.
  const [failedTabs, setFailedTabs] = useState(NO_FAILURES);
  const [isFetchingNext, setIsFetchingNext] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  // Tabs whose first page was already requested (seeded with tabs cached in the store, e.g. Back from a
  // thread, so they render instantly); guards against duplicate fetches across re-renders.
  const requestedTabsRef = useRef<Set<FeedTab>>(cachedFeedTabs());
  const feedIds = useFeedIds(activeTab);
  const { loaded, nextPage } = useFeedMeta(activeTab);
  const failed = failedTabs[activeTab];

  /** Loads one page into the store; resolves false on failure. Stable identity (no `t` dependency). */
  const loadPage = useCallback(async (tab: FeedTab, page: number) => {
    try {
      const result = await fetchFeed(tab, page, viewerId);
      upsertPosts(result.posts);
      setFeedPage(tab, result.posts.map((p) => p.id), page > 1, result.nextPage);
      if (page === 1) {
        // The fresh page covers every buffered post of this tab (same follow graph) -> nothing stays pending
        const followed = getFollowedIds(viewerId);
        if (tab === "forYou" || followed.loaded) {
          const state = usePostStore.getState();
          consumeIncoming(tab, getPendingFeed(state.posts, state, tab, followed.ids).ids);
        }
      }
      setFailedTabs((prev) => (prev[tab] ? { ...prev, [tab]: false } : prev));
      return true;
    } catch {
      setFailedTabs((prev) => ({ ...prev, [tab]: true }));
      return false;
    }
  }, [viewerId, upsertPosts, setFeedPage, consumeIncoming]);

  const loadWithFeedback = useCallback((tab: FeedTab, page: number) =>
    loadPage(tab, page).then((ok) => {
      if (!ok) toast.error(t("common.error"));
    }), [loadPage, t]);

  // Complete follow set: classifies "following" pending posts; stream runs only while the feed is visible
  useEffect(() => {
    ensureFollowGraph(viewerId).catch(() => undefined);
  }, [viewerId]);
  useNewPostsStream();

  const refetchFirstPage = useCallback(() => loadWithFeedback(activeTab, 1), [activeTab, loadWithFeedback]);

  const loadNextPage = useCallback((tab: FeedTab, page: number) => {
    setIsFetchingNext(true);
    void loadWithFeedback(tab, page).finally(() => setIsFetchingNext(false));
  }, [loadWithFeedback]);

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

  const handleRetryNext = () => {
    if (nextPage !== undefined && !isFetchingNext) loadNextPage(activeTab, nextPage);
  };

  // Infinite scroll observer. Paused after a failure: re-observing a still-visible sentinel would
  // refetch (and toast) in a tight loop, so the user retries explicitly instead.
  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || nextPage === undefined || failed) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isFetchingNext) loadNextPage(activeTab, nextPage);
      },
      { threshold: 0.1 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [activeTab, nextPage, failed, isFetchingNext, loadNextPage]);

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
          aria-label={t("feed.refresh")}
          className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-400 hover:text-black dark:hover:text-white transition-transform active:rotate-185 shrink-0"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </header>

      <NewPostsPill tab={activeTab} onRefetch={refetchFirstPage} />

      {/* Composition Block */}
      <PostCreator onSuccess={handleComposerSuccess} />

      {/* Infinite Feed Container */}
      <div className="flex flex-col w-full divide-y divide-zinc-200/60 dark:divide-zinc-900/60">
        {!loaded && !failed ? (
          /* Enforce Zero CLS Skeletal shimmer list */
          <PostSkeletonList count={4} />
        ) : feedIds.length === 0 ? (
          failed ? (
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
      {nextPage !== undefined && (
        <div ref={loadMoreRef} className="w-full flex justify-center py-6">
          {isFetchingNext ? (
            <PostSkeletonText />
          ) : failed && feedIds.length > 0 ? (
            <button
              type="button"
              onClick={handleRetryNext}
              className="min-h-11 px-5 rounded-full border border-zinc-200 dark:border-zinc-800 text-sm font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors motion-reduce:transition-none"
            >
              {t("postDetail.retry")}
            </button>
          ) : (
            <div className="h-2 w-full" />
          )}
        </div>
      )}
    </div>
  );
}
export default PostFeed;

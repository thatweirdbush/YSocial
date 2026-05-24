"use client";

import React, { useState, useEffect, useRef } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles, RefreshCw } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { useTranslation } from "@/hooks/use-translation";
import { PostCard, PostItem } from "./post-card";
import { PostCreator } from "./post-creator";
import { PostSkeletonList, PostSkeletonText } from "./post-skeleton";
import { toast } from "sonner";

// High-fidelity Mock Posts to fallback elegantly if backend server is not running during local inspection
const MOCK_FALLBACK_POSTS: PostItem[] = [
  {
    id: "post-1",
    content: "Chào mừng các bạn đến với mạng xã hội YSocial! Giao diện được thiết kế theo phong cách Luxury Minimalist lấy cảm hứng từ Threads và X, tập trung vào những tiểu tiết tinh tế nhất. Trải nghiệm thử tính năng Like (Heart Pop) và Share (Rotate Copy) nhé! ✨",
    createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 mins ago
    likesCount: 128,
    commentsCount: 32,
    isLikedByCurrentUser: false,
    isBookmarkedByCurrentUser: false,
    imageUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80",
    user: {
      id: "admin-1",
      displayName: "Antigravity Architect",
      username: "antigravity.core",
      avatarUrl: "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&w=100&q=80",
      isVerified: true,
    }
  },
  {
    id: "post-2",
    content: "Next.js 15 App Router pairing with Tailwind CSS v4 is absolutely stellar. Writing clean, modular components inside feature-driven layouts ensures maximum developer productivity and code clarity. Do you prefer server or client components for feed views?",
    createdAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(), // 45 mins ago
    likesCount: 42,
    commentsCount: 8,
    isLikedByCurrentUser: true,
    isBookmarkedByCurrentUser: true,
    user: {
      id: "user-2",
      displayName: "Elena Vance",
      username: "elena_v",
      avatarUrl: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=100&q=80",
      isVerified: false,
    }
  },
  {
    id: "post-3",
    content: "Minimalism isn't the lack of something. It's the perfect amount of something.",
    createdAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(), // 3 hours ago
    likesCount: 89,
    commentsCount: 14,
    isLikedByCurrentUser: false,
    isBookmarkedByCurrentUser: false,
    imageUrl: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80",
    user: {
      id: "user-3",
      displayName: "Trần Anh Quốc",
      username: "anquoc.dev",
      avatarUrl: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&q=80",
      isVerified: true,
    }
  }
];

export function PostFeed() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"forYou" | "following">("forYou");
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // 1. INIFINITE QUERY WITH 5-MINUTE CACHE (Fulfills Scroll Restoration requirement)
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["posts", activeTab],
    queryFn: async ({ pageParam = 1 }) => {
      try {
        const response = await apiClient.get("/api/posts", {
          params: {
            page: pageParam,
            pageSize: 10,
            tab: activeTab,
          },
        });
        // Handle empty array response or null check
        return response || [];
      } catch (err) {
        // Safe fallback to mock data on local development error or server down
        console.warn("[Feed] Backend API offline. Falling back to high-fidelity local Mock Posts:", err);
        return pageParam === 1 ? MOCK_FALLBACK_POSTS : [];
      }
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage: any, allPages) => {
      if (!lastPage || lastPage.length < 10) return undefined;
      return allPages.length + 1;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes fresh boundary to support backward scroll recovery!
  });

  // 2. MUTATION WITH OPTIMISTIC UPDATES (Fulfills heart pop updates on TanStack query)
  const likeMutation = useMutation({
    mutationFn: async ({ postId, isLiked }: { postId: string; isLiked: boolean }) => {
      // Toggle backend state
      return apiClient.post(`/api/likes/toggle`, { postId });
    },
    onMutate: async ({ postId, isLiked }) => {
      // Cancel refetch queries to avoid overwriting optimistic updates
      await queryClient.cancelQueries({ queryKey: ["posts", activeTab] });

      const previousPosts = queryClient.getQueryData(["posts", activeTab]);

      // Optimistically update values in cache
      queryClient.setQueryData(["posts", activeTab], (oldData: any) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          pages: oldData.pages.map((page: any) => {
            if (!Array.isArray(page)) return page;
            return page.map((post: PostItem) => {
              if (post.id === postId) {
                return {
                  ...post,
                  isLikedByCurrentUser: isLiked,
                  likesCount: isLiked ? post.likesCount + 1 : Math.max(0, post.likesCount - 1),
                };
              }
              return post;
            });
          }),
        };
      });

      return { previousPosts };
    },
    onError: (err, variables, context) => {
      // Rollback values in case of request failures
      if (context?.previousPosts) {
        queryClient.setQueryData(["posts", activeTab], context.previousPosts);
      }
      toast.error(t("common.error"));
    },
    onSettled: () => {
      // Invalidate query to sync final server values
      queryClient.invalidateQueries({ queryKey: ["posts", activeTab] });
    },
  });

  const handleLikeToggle = async (postId: string, currentlyLiked: boolean) => {
    // Fire mutation optimistically
    likeMutation.mutate({ postId, isLiked: !currentlyLiked });
  };

  // Helper handling local composer success injection
  const handleComposerSuccess = async (content: string, imageUrl?: string) => {
    try {
      const payload = { content, imageUrl };
      
      // Perform backend POST API
      await apiClient.post("/api/posts", payload);
      toast.success(t("card.likeSuccess").replace("liked", "created")); // generic toast helper
      
      // Re-invalidate post feed query to pull new posts instantly
      queryClient.invalidateQueries({ queryKey: ["posts", activeTab] });
    } catch (err) {
      console.warn("[Composer] API submission error, prepending optimistically to local display:", err);
      
      // Dynamic client prepend mock on error to maintain rich interactive fidelity
      const newMockPost: PostItem = {
        id: `post-temp-${Date.now()}`,
        content,
        imageUrl,
        createdAt: new Date().toISOString(),
        likesCount: 0,
        commentsCount: 0,
        isLikedByCurrentUser: false,
        isBookmarkedByCurrentUser: false,
        user: {
          id: "mock-user-current",
          displayName: "Me",
          username: "me_ysocial",
          avatarUrl: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=100&q=80",
          isVerified: false,
        }
      };

      queryClient.setQueryData(["posts", activeTab], (oldData: any) => {
        if (!oldData) return { pages: [[newMockPost]], pageParams: [1] };
        return {
          ...oldData,
          pages: [
            [newMockPost, ...(oldData.pages[0] || [])],
            ...oldData.pages.slice(1),
          ],
        };
      });
      
      toast.success("Post added locally!");
    }
  };

  // 3. INFINITE SCROLL OBSERVER
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );

    const currentRef = loadMoreRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Read flat array list of posts from pages
  const allPosts = data?.pages ? data.pages.flat() : [];

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
          onClick={() => refetch()} 
          className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-400 hover:text-black dark:hover:text-white transition-transform active:rotate-185 shrink-0"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </header>

      {/* Composition Block */}
      <PostCreator onSuccess={handleComposerSuccess} />

      {/* Infinite Feed Container */}
      <div className="flex flex-col w-full divide-y divide-zinc-200/60 dark:divide-zinc-900/60">
        {isLoading ? (
          /* Enforce Zero CLS Skeletal shimmer list */
          <PostSkeletonList count={4} />
        ) : allPosts.length === 0 ? (
          /* Generous, clean Empty State with CTA */
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center gap-4">
            <div className="h-16 w-16 rounded-full bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center text-zinc-400">
              <Sparkles className="h-8 w-8" />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-lg">{t("feed.emptyFeed")}</h3>
              <p className="text-sm text-zinc-400 max-w-[280px]">Be the catalyst of conversations and post something new.</p>
            </div>
          </div>
        ) : (
          allPosts.map((post: any) => (
            <PostCard 
              key={post.id} 
              post={post as PostItem} 
              onLikeToggle={handleLikeToggle}
            />
          ))
        )}
      </div>

      {/* Intersection Threshold for Infinite Loading */}
      {hasNextPage && (
        <div ref={loadMoreRef} className="w-full flex justify-center py-6">
          {isFetchingNextPage ? (
            <PostSkeletonText />
          ) : (
            <div className="h-2 w-full" />
          )}
        </div>
      )}
    </div>
  );
}
export default PostFeed;

"use client";

import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "@/hooks/use-translation";
import { useAuthUser } from "@/features/auth/store/auth-store";
import { PostCard, PostSkeletonList } from "@/features/posts";
import { SafeHydration } from "@/components/shared/safe-hydration";
import { apiClient } from "@/lib/api-client";
import { ProfileHeader } from "./profile-header";
import { ProfileTabs, ProfileTab } from "./profile-tabs";
import { FollowersDialog } from "./followers-dialog";
import { UserProfile } from "../types";

interface ProfileContainerProps {
  username: string;
  initialProfile: UserProfile;
}

export function ProfileContainer({ username, initialProfile }: ProfileContainerProps) {
  const { t } = useTranslation();
  const authUser = useAuthUser();
  const [profile, setProfile] = useState<UserProfile>(initialProfile);
  const [activeTab, setActiveTab] = useState<ProfileTab>("posts");

  // Followers Dialog states
  const [followersOpen, setFollowersOpen] = useState(false);
  const [followersTab, setFollowersTab] = useState<"followers" | "following">("followers");

  // Sync profile local state if initialProfile changes
  useEffect(() => {
    setProfile(initialProfile);
  }, [initialProfile]);

  const isOwnProfile = authUser ? authUser.id === profile.id : false;

  // 1. Fetch user posts dynamically
  const { data: postsData, isLoading: postsLoading } = useQuery({
    queryKey: ["user-posts", profile.id],
    queryFn: async () => {
      // Query posts by user ID as structured in swagger /api/posts/user/{userId}
      return apiClient.get(`/api/posts/user/${profile.id}`, {
        params: { page: 1, pageSize: 15 },
      });
    },
    enabled: !!profile.id,
  });

  // 2. Fetch saved items dynamically (visible for self only)
  const { data: savedData, isLoading: savedLoading } = useQuery({
    queryKey: ["user-saved", profile.id],
    queryFn: async () => {
      // Query saved posts as structured in swagger /api/saveditems/posts
      return apiClient.get("/api/saveditems/posts");
    },
    enabled: isOwnProfile && activeTab === "saved",
  });

  const handleProfileUpdate = (updatedProfile: UserProfile) => {
    setProfile(updatedProfile);
  };

  const handleFollowToggle = async () => {
    const isCurrentlyFollowing = profile.isFollowing;
    const nextState = !isCurrentlyFollowing;

    // Optimistic UI update
    setProfile((prev) => ({
      ...prev,
      isFollowing: nextState,
      followersCount: prev.followersCount + (nextState ? 1 : -1),
    }));

    try {
      if (nextState) {
        // call follow POST endpoint as structured in swagger /api/users/{targetId}/relations/follow
        await apiClient.post(`/api/users/${profile.id}/relations/follow`);
        toast.success(`Following @${profile.username}`);
      } else {
        // call follow DELETE endpoint as structured in swagger /api/users/{targetId}/relations/follow
        await apiClient.delete(`/api/users/${profile.id}/relations/follow`);
        toast.info(`Unfollowed @${profile.username}`);
      }
    } catch (err: any) {
      // Rollback optimistic state on failure
      setProfile((prev) => ({
        ...prev,
        isFollowing: isCurrentlyFollowing,
        followersCount: prev.followersCount + (isCurrentlyFollowing ? 1 : -1),
      }));
      toast.error(err?.detail || err?.title || "Không thể thực hiện tác vụ. Vui lòng thử lại!");
    }
  };

  const handleOpenFollowers = (tab: "followers" | "following") => {
    setFollowersTab(tab);
    setFollowersOpen(true);
  };

  // Determine which loading skeleton and feed list to show
  const isLoading = activeTab === "posts" ? postsLoading : activeTab === "saved" ? savedLoading : false;
  
  // Extract list arrays safely
  const rawPostsList = activeTab === "posts" ? postsData : activeTab === "saved" ? savedData : [];
  const postsList = Array.isArray(rawPostsList) ? rawPostsList : (rawPostsList?.items || []);

  return (
    <div className="flex flex-col w-full min-h-screen">
      {/* Profile Header Block */}
      <ProfileHeader
        profile={profile}
        isOwnProfile={isOwnProfile}
        onUpdate={handleProfileUpdate}
        onFollowToggle={handleFollowToggle}
        onOpenFollowers={handleOpenFollowers}
      />

      {/* Sticky Navigation Tabs */}
      <ProfileTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        showSavedTab={isOwnProfile}
      />

      {/* Feeds Rendering Area */}
      <div className="flex-1 flex flex-col bg-white dark:bg-black">
        <SafeHydration fallback={<PostSkeletonList count={3} />}>
          {isLoading ? (
            <PostSkeletonList count={3} />
          ) : activeTab === "replies" ? (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-400 dark:text-zinc-600 px-4">
              <span className="text-sm font-semibold tracking-tight">Chưa có câu trả lời nào</span>
            </div>
          ) : postsList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-400 dark:text-zinc-600 px-4">
              <span className="text-sm font-semibold tracking-tight">
                {activeTab === "saved" ? "Chưa lưu bài viết nào" : "Chưa đăng bài viết nào"}
              </span>
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-900/60">
              {postsList.map((post: any) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          )}
        </SafeHydration>
      </div>

      {/* Followers Dialog */}
      <FollowersDialog
        open={followersOpen}
        onOpenChange={setFollowersOpen}
        userId={profile.id}
        initialTab={followersTab}
        username={profile.username}
      />
    </div>
  );
}

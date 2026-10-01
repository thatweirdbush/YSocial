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
import { ProfileTabs } from "./profile-tabs";
import { FollowersDialog } from "./followers-dialog";
import type { ProfileTab, UserProfile } from "../types";

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

  const isOwnProfile = authUser
    ? authUser.id === profile.id
    : (profile.username === "ysocial_member" || profile.username === "ysocial_user");

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
  let postsList = Array.isArray(rawPostsList) ? rawPostsList : (rawPostsList?.items || []);

  // 3. Dynamic Development mock posts generator
  if (process.env.NODE_ENV === "development" && postsList.length === 0) {
    const isMe = profile.username === "ysocial_member" || profile.username === "ysocial_user";
    postsList = [
      {
        id: `post-${profile.id}-1`,
        content: isMe 
          ? "🎯 Vừa hoàn thành cấu trúc Dynamic User Profile cho YSocial! Mọi người thấy giao diện mới này thế nào? Đã tách biệt SSR/CSR, bảo mật chống XSS cho Bio parser và đặc biệt là chống Cumulative Layout Shift (CLS) tuyệt đối bằng bounding boxes skeletons. Hàng hiệu luôn nhé! 🔥"
          : profile.username === "anquoc.dev"
          ? "💻 Sáng nay cà phê và tối ưu lại toàn bộ Right Sidebar cho YSocial Front-end Client. Việc cô lập state tìm kiếm giúp giảm hơn 80% số lần re-render không cần thiết. Coding is art!"
          : "🌸 Hôm nay trời đẹp quá, dạo một vòng hồ Tây chụp vài tấm ảnh lung linh. YSocial giao diện Zinc Minimalist nhìn nghiện thật sự!",
        imageUrls: profile.username === "hamy_cute" 
          ? ["https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=600&q=80"]
          : undefined,
        createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(), // 45 minutes ago
        likesCount: profile.username === "anquoc.dev" ? 42 : 12,
        commentsCount: profile.username === "anquoc.dev" ? 8 : 2,
        isLikedByCurrentUser: true,
        isBookmarkedByCurrentUser: false,
        user: {
          id: profile.id,
          displayName: profile.displayName,
          username: profile.username,
          avatarUrl: profile.avatarUrl,
          isVerified: profile.isVerified,
        }
      },
      {
        id: `post-${profile.id}-2`,
        content: isMe
          ? "Bảo mật luôn là ưu tiên hàng đầu! Vừa viết xong regex băm URL trong Bio, chỉ cho phép giao thức http và https hoạt động để chặn đứng các cuộc tấn công XSS thông qua script injection javascript: hoặc data: 🛡️"
          : profile.username === "anquoc.dev"
          ? "☕️ Coffee time & Code review. Một ngày làm việc hiệu suất cùng đội ngũ YSocial."
          : "Hôm nay đọc được một cuốn sách rất hay về thiết kế tối giản (Minimalist Design). Càng lược bỏ những chi tiết thừa, sản phẩm càng trở nên sang trọng và tinh tế.",
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(), // 5 hours ago
        likesCount: profile.username === "anquoc.dev" ? 88 : 24,
        commentsCount: profile.username === "anquoc.dev" ? 15 : 4,
        isLikedByCurrentUser: false,
        isBookmarkedByCurrentUser: true,
        user: {
          id: profile.id,
          displayName: profile.displayName,
          username: profile.username,
          avatarUrl: profile.avatarUrl,
          isVerified: profile.isVerified,
        }
      }
    ];
  }

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
                <PostCard 
                  key={post.id} 
                  post={post}
                  isAuthorFollowing={post.user.id === profile.id ? profile.isFollowing : undefined}
                  onAuthorFollowToggle={post.user.id === profile.id ? handleFollowToggle : undefined}
                />
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

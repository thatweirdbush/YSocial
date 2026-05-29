import { notFound } from "next/navigation";
import { MainLayout } from "@/components/layout/main-layout";
import { ProfileContainer } from "@/features/profile";
import { UserProfile } from "@/features/profile/types";

const BASE_URL = "https://localhost:49895";

interface PageProps {
  params: Promise<{
    "@username": string;
  }>;
}

export async function generateMetadata({ params }: PageProps) {
  const resolvedParams = await params;
  const rawUsername = resolvedParams["@username"];
  const username = decodeURIComponent(rawUsername).replace(/^@/, "");

  return {
    title: `${username} (@${username}) • YSocial`,
    description: `Xem bài viết, câu trả lời và nội dung đã lưu của @${username} trên YSocial.`,
    openGraph: {
      title: `${username} (@${username}) • YSocial`,
      description: `Xem bài viết, câu trả lời và nội dung đã lưu của @${username} trên YSocial.`,
      type: "profile",
    },
  };
}

export default async function ProfilePage({ params }: PageProps) {
  const resolvedParams = await params;
  const rawUsername = resolvedParams["@username"];

  // Clean username: e.g. @anquoc.dev -> anquoc.dev
  const username = decodeURIComponent(rawUsername).replace(/^@/, "");

  let profile: UserProfile | null = null;

  try {
    // 1. SSR Fetch: Query profile details dynamically by username from the Backend API
    const response = await fetch(`${BASE_URL}/api/users/profiles/username/${username}`, {
      next: { revalidate: 30 }, // Cache the profile for 30 seconds
    });

    if (response.status === 404) {
      notFound();
    }

    if (response.ok) {
      const data = await response.json();
      // Safely map PascalCase response keys into dynamic camelCase
      profile = {
        id: data.id || data.Id,
        displayName: data.displayName || data.DisplayName || username,
        username: data.username || data.Username || username,
        bio: data.bio || data.Bio || undefined,
        avatarUrl: data.avatarUrl || data.AvatarUrl || undefined,
        coverUrl: data.coverUrl || data.CoverUrl || undefined,
        followersCount: data.followersCount ?? data.FollowersCount ?? 0,
        followingCount: data.followingCount ?? data.FollowingCount ?? 0,
        isFollowing: data.isFollowing ?? data.IsFollowing ?? false,
        isVerified: data.isVerified ?? data.IsVerified ?? false,
      };
    } else {
      // Direct user to 404 on any other loading failures to secure system flow
      notFound();
    }
  } catch (error) {
    // 2. RESILIENT DEVELOPMENT BYPASS:
    // Since swagger.json shows the C# backend lacks any GET user profiles endpoints,
    // fetches will always fail with network exceptions when offline or unimplemented.
    // In local development, we fallback to high-fidelity mock profile records matching the username,
    // allowing the developer to fully view, edit and test the luxury visual elements.
    if (process.env.NODE_ENV === "development") {
      const isMe = username === "ysocial_member" || username === "ysocial_user";
      profile = {
        id: isMe ? "1" : username === "anquoc.dev" ? "2" : "3",
        displayName: isMe
          ? "YSocial User"
          : username === "anquoc.dev"
            ? "Trần Anh Quốc"
            : username === "hamy_cute"
              ? "Nguyễn Hà My"
              : username,
        username: username,
        bio: isMe
          ? "Đây là tài khoản thử nghiệm của tôi trên YSocial! Hãy kết nối nhé: https://github.com/thatweirdbush"
          : `Xin chào, tôi là ${username}. Ghé thăm website của tôi tại: https://www.google.com`,
        avatarUrl: isMe
          ? undefined
          : username === "anquoc.dev"
            ? "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80"
            : "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=100&q=80",
        followersCount: username === "anquoc.dev" ? 245 : 120,
        followingCount: username === "anquoc.dev" ? 180 : 95,
        isFollowing: username === "anquoc.dev",
        isVerified: username === "anquoc.dev" || isMe,
      };
    } else {
      // In production, strictly fail with standard 404 page
      notFound();
    }
  }

  if (!profile) {
    notFound();
  }

  return (
    <MainLayout>
      <ProfileContainer username={username} initialProfile={profile} />
    </MainLayout>
  );
}

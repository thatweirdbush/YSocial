"use client";

import React, { useState } from "react";
import { BadgeCheck, MessageSquare } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/use-translation";
import { parseBio } from "../utils/bio-parser";
import { EditProfileDialog } from "./edit-profile-dialog";
import { UserProfile } from "../types";

interface ProfileHeaderProps {
  profile: UserProfile;
  isOwnProfile: boolean;
  onUpdate: (updatedProfile: UserProfile) => void;
  onFollowToggle: () => void;
  onOpenFollowers: (tab: "followers" | "following") => void;
}

export function ProfileHeader({
  profile,
  isOwnProfile,
  onUpdate,
  onFollowToggle,
  onOpenFollowers,
}: ProfileHeaderProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-5 py-6 px-4 md:px-6">
      {/* 1. Main visual block: Left details vs Right avatar (Threads Style) */}
      <div className="flex items-start justify-between gap-6">
        <div className="flex flex-col gap-1.5 min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 truncate">
              {profile.displayName}
            </h1>
            {profile.isVerified && (
              <BadgeCheck className="h-5 w-5 text-blue-500 fill-blue-500 shrink-0" />
            )}
          </div>
          <span className="text-zinc-500 dark:text-zinc-400 text-sm font-medium">
            @{profile.username}
          </span>
        </div>

        {/* Large Avatar */}
        <Avatar className="h-20 w-20 sm:h-24 sm:w-24 border-2 border-zinc-150 dark:border-zinc-850 shadow-sm shrink-0">
          <AvatarImage src={profile.avatarUrl} />
          <AvatarFallback className="bg-zinc-200 dark:bg-zinc-800 text-xl font-bold">
            {profile.displayName.charAt(0)}
          </AvatarFallback>
        </Avatar>
      </div>

      {/* 2. Secure URLparsed biography */}
      {profile.bio && (
        <p className="text-zinc-850 dark:text-zinc-200 text-sm leading-relaxed whitespace-pre-wrap">
          {parseBio(profile.bio)}
        </p>
      )}

      {/* 3. Minimialist follow metrics counter */}
      <div className="flex items-center gap-4 text-sm text-zinc-500 dark:text-zinc-450">
        <span
          onClick={() => onOpenFollowers("followers")}
          className="hover:underline hover:text-zinc-900 dark:hover:text-zinc-100 cursor-pointer transition-colors"
        >
          <strong className="font-semibold text-zinc-900 dark:text-zinc-100">
            {profile.followersCount}
          </strong>{" "}
          followers
        </span>
        <span className="text-zinc-300 dark:text-zinc-850 select-none">•</span>
        <span
          onClick={() => onOpenFollowers("following")}
          className="hover:underline hover:text-zinc-900 dark:hover:text-zinc-100 cursor-pointer transition-colors"
        >
          <strong className="font-semibold text-zinc-900 dark:text-zinc-100">
            {profile.followingCount}
          </strong>{" "}
          following
        </span>
      </div>

      {/* 4. Contextual action CTA block */}
      <div className="flex items-center gap-3 mt-1.5 shrink-0">
        {isOwnProfile ? (
          <EditProfileDialog profile={profile} onUpdate={onUpdate}>
            <Button
              variant="outline"
              className="flex-1 sm:flex-initial rounded-2xl px-6 py-2.5 text-xs font-bold border-zinc-250 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors shadow-sm"
            >
              Chỉnh sửa trang cá nhân
            </Button>
          </EditProfileDialog>
        ) : (
          <>
            <Button
              onClick={onFollowToggle}
              variant={profile.isFollowing ? "outline" : "default"}
              className={`flex-1 sm:flex-initial text-xs font-bold tracking-tight transition-all duration-300 px-6 py-2.5 rounded-2xl border ${
                profile.isFollowing
                  ? "bg-zinc-100 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-450 hover:bg-zinc-200 dark:hover:bg-zinc-850 hover:text-zinc-700 dark:hover:text-zinc-350"
                  : "bg-zinc-950 dark:bg-zinc-50 text-white dark:text-black hover:bg-zinc-800 dark:hover:bg-zinc-200 shadow-md hover:shadow-lg"
              }`}
            >
              {profile.isFollowing ? t("card.following") || "Following" : t("card.follow") || "Follow"}
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="rounded-2xl h-10 w-10 border-zinc-250 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 shrink-0 shadow-sm"
            >
              <MessageSquare className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

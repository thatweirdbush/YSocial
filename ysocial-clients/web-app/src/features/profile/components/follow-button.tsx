"use client";

import React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/use-translation";
import { cn } from "@/lib/utils";
import { setFollow } from "../services/user-service";
import { useUser, useUserActions } from "../store/user-store";

interface FollowButtonProps {
  userId: string;
  className?: string;
}

/** Follow toggle bound to `user-store`; persists to the user service. */
export function FollowButton({ userId, className }: FollowButtonProps) {
  const { t } = useTranslation();
  const user = useUser(userId);
  const { toggleFollow } = useUserActions();

  if (!user) return null;

  const handleClick = (e: React.MouseEvent) => {
    // Rows around the button link to the profile; keep the click local
    e.preventDefault();
    e.stopPropagation();
    const next = !user.isFollowing;
    toggleFollow(userId);
    void setFollow(userId, next);
    if (next) toast.success(t("card.followSuccess", { username: user.username }));
    else toast.info(t("card.unfollowSuccess", { username: user.username }));
  };

  return (
    <Button
      type="button"
      onClick={handleClick}
      size="sm"
      variant="outline"
      aria-pressed={user.isFollowing}
      className={cn(
        "relative shrink-0 rounded-full border px-3 py-0.5 text-[11px] font-bold tracking-tight transition-all duration-300 motion-reduce:transition-none",
        // Invisible hit area -> 44px touch target without changing the visual size
        "after:absolute after:-inset-x-1 after:-inset-y-2 after:content-['']",
        user.isFollowing
          ? "border-zinc-200 bg-zinc-100 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
          : "border-zinc-950 bg-transparent text-black hover:bg-black hover:text-white dark:border-zinc-100 dark:text-white dark:hover:bg-white dark:hover:text-black",
        className,
      )}
    >
      {user.isFollowing ? t("card.following") : t("card.follow")}
    </Button>
  );
}

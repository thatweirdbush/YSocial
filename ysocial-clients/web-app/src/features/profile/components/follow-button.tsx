"use client";

import React from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { useActorId } from "@/features/auth";
import { useTranslation } from "@/hooks/use-translation";
import { cn } from "@/lib/utils";
import { setFollow } from "../services/user-service";
import { useFollowState, useUser, useUserActions } from "../store/user-store";

interface FollowButtonProps {
  userId: string;
  className?: string;
  /** Keep an invisible same-size placeholder while the user/follow state loads (no header shift). */
  reserveSpace?: boolean;
}

const BASE = "relative shrink-0 rounded-full border px-3 py-0.5 text-[11px] font-bold tracking-tight";

/** Follow toggle bound to `user-store`; persists to the user service. */
export function FollowButton({ userId, className, reserveSpace = false }: FollowButtonProps) {
  const { t } = useTranslation();
  const actorId = useActorId();
  const user = useUser(userId);
  const isFollowing = useFollowState(userId);
  const { toggleFollow } = useUserActions();

  // Unknown follow state (e.g. right after an account switch) -> never render a guessed "Follow"
  if (!user || isFollowing === undefined) {
    if (!reserveSpace) return null;
    return (
      <span aria-hidden="true" className={cn(buttonVariants({ size: "sm", variant: "outline" }), BASE, "invisible", className)}>
        {t("card.follow")}
      </span>
    );
  }

  const handleClick = (e: React.MouseEvent) => {
    // Rows around the button link to the profile; keep the click local
    e.preventDefault();
    e.stopPropagation();
    const next = !isFollowing;
    toggleFollow(actorId, userId);
    void setFollow(userId, next, actorId);
    if (next) toast.success(t("card.followSuccess", { username: user.username }));
    else toast.info(t("card.unfollowSuccess", { username: user.username }));
  };

  return (
    <Button
      type="button"
      onClick={handleClick}
      size="sm"
      variant="outline"
      aria-pressed={isFollowing}
      className={cn(
        BASE,
        "transition-all duration-300 motion-reduce:transition-none",
        // Invisible hit area -> 44px touch target without changing the visual size
        "after:absolute after:-inset-x-1 after:-inset-y-2 after:content-['']",
        isFollowing
          ? "border-zinc-200 bg-zinc-100 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
          : "border-zinc-950 bg-transparent text-black hover:bg-black hover:text-white dark:border-zinc-100 dark:text-white dark:hover:bg-white dark:hover:text-black",
        className,
      )}
    >
      {isFollowing ? t("card.following") : t("card.follow")}
    </Button>
  );
}

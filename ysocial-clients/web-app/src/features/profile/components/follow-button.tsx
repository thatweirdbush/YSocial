"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useActorId } from "@/features/auth";
import { useTranslation } from "@/hooks/use-translation";
import { cn } from "@/lib/utils";
import { commitFollow, useFollowState, useUser } from "../store/user-store";

interface FollowButtonProps {
  userId: string;
  className?: string;
  /** Keep an invisible same-size placeholder while the user/follow state loads (no header shift). */
  reserveSpace?: boolean;
  /** Ask before unfollowing (lists of many people, where a stray click is likely). */
  confirmUnfollow?: boolean;
}

const BASE = "relative shrink-0 rounded-full border px-3 py-0.5 text-[11px] font-bold tracking-tight";

/** Follow toggle bound to `user-store`; persists to the user service. */
export function FollowButton({ userId, className, reserveSpace = false, confirmUnfollow = false }: FollowButtonProps) {
  const { t } = useTranslation();
  const actorId = useActorId();
  const user = useUser(userId);
  const isFollowing = useFollowState(userId);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Unknown follow state (e.g. right after an account switch) -> never render a guessed "Follow"
  if (!user || isFollowing === undefined) {
    if (!reserveSpace) return null;
    return (
      <span aria-hidden="true" className={cn(buttonVariants({ size: "sm", variant: "outline" }), BASE, "invisible", className)}>
        {t("card.follow")}
      </span>
    );
  }

  const commit = () => {
    const next = !isFollowing;
    void commitFollow(actorId, userId).then((ok) => {
      if (!ok) toast.error(t("card.followError"));
    });
    if (next) toast.success(t("card.followSuccess", { username: user.username }));
    else toast.info(t("card.unfollowSuccess", { username: user.username }));
  };

  const handleClick = (e: React.MouseEvent) => {
    // Rows around the button link to the profile; keep the click local
    e.preventDefault();
    e.stopPropagation();
    if (isFollowing && confirmUnfollow) setConfirmOpen(true);
    else commit();
  };

  return (
    <>
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
    {confirmUnfollow && (
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="z-[100] flex w-[320px] flex-col items-center gap-4 rounded-3xl border-zinc-200 bg-white p-6 text-center dark:border-zinc-900 dark:bg-zinc-950 [&>button]:hidden">
          <DialogHeader className="flex w-full flex-col items-center gap-3">
            <Avatar className="mx-auto size-18 border border-zinc-100 shadow-sm dark:border-zinc-900">
              <AvatarImage src={user.avatarUrl} alt="" />
              <AvatarFallback className="bg-zinc-200 text-xl font-bold dark:bg-zinc-800">
                {user.displayName.charAt(0).toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
            <DialogTitle className="mx-auto text-base font-semibold leading-tight text-zinc-900 dark:text-zinc-50">
              {t("profile.unfollowConfirmTitle", { username: user.username })}
            </DialogTitle>
          </DialogHeader>
          <div className="mt-2 flex w-full flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              className="min-h-11 flex-1 rounded-2xl border-zinc-200 bg-transparent font-bold shadow-none hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900"
            >
              {t("profile.unfollowConfirmCancel")}
            </Button>
            <Button
              type="button"
              onClick={() => {
                setConfirmOpen(false);
                commit();
              }}
              className="min-h-11 flex-1 rounded-2xl border-none bg-red-500 font-bold text-white shadow-none hover:bg-red-600"
            >
              {t("profile.unfollowConfirmAction")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    )}
    </>
  );
}

"use client";

import { useRouter } from "next/navigation";
import React, { useState } from "react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GUEST_ACTOR_ID, useActorId } from "@/features/auth";
import { useTranslation } from "@/hooks/use-translation";
import { cn } from "@/lib/utils";
import { commitBlock, useIsBlocked, useIsBlockedBy } from "../store/relation-store";
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

/**
 * Follow control bound to `user-store`; persists to the user service. States: Follow / Requested (pending request,
 * click cancels without confirm) / Following. A guest sees the same button; clicking it goes to `/login`.
 */
export function FollowButton({ userId, className, reserveSpace = false, confirmUnfollow = false }: FollowButtonProps) {
  const { t } = useTranslation();
  const actorId = useActorId();
  const router = useRouter();
  const user = useUser(userId);
  const status = useFollowState(userId);
  const isBlocked = useIsBlocked(userId);
  const isBlockedBy = useIsBlockedBy(userId);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Unknown follow state (e.g. right after an account switch) -> never render a guessed "Follow"
  if (!user || status === undefined) {
    if (!reserveSpace) return null;
    return (
      <span aria-hidden="true" className={cn(buttonVariants({ size: "sm", variant: "outline" }), BASE, "invisible", className)}>
        {t("card.follow")}
      </span>
    );
  }

  // The user blocked the viewer: nothing to follow. The viewer blocked the user: the only action is Unblock
  if (isBlockedBy) return null;
  if (isBlocked) {
    const handleUnblock = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      void commitBlock(actorId, userId, false).then((ok) => {
        if (ok) toast.success(t("relations.unblockedToast", { username: user.username }));
        else toast.error(t("relations.actionError"));
      });
    };
    return (
      <Button
        type="button"
        onClick={handleUnblock}
        size="sm"
        variant="outline"
        className={cn(
          BASE,
          "border-zinc-950 bg-transparent text-black transition-all duration-300 hover:bg-black hover:text-white motion-reduce:transition-none dark:border-zinc-100 dark:text-white dark:hover:bg-white dark:hover:text-black",
          "after:absolute after:-inset-x-1 after:-inset-y-2 after:content-['']",
          className,
        )}
      >
        {t("relations.unblock")}
      </Button>
    );
  }

  const isFollowing = status === "accepted";
  const isRequested = status === "pending";

  const commit = (next: "follow" | "unfollow") => {
    void commitFollow(actorId, userId, next).then((ok) => {
      if (!ok) toast.error(t("card.followError"));
    });
    const params = { username: user.username };
    if (next === "follow") toast.success(t(user.isPrivate ? "relations.requestSentToast" : "card.followSuccess", params));
    else toast.info(t(isRequested ? "relations.requestCanceledToast" : "card.unfollowSuccess", params));
  };

  const handleClick = (e: React.MouseEvent) => {
    // Rows around the button link to the profile; keep the click local
    e.preventDefault();
    e.stopPropagation();
    if (actorId === GUEST_ACTOR_ID) router.push("/login");
    else if (isFollowing && confirmUnfollow) setConfirmOpen(true);
    else commit(status === "none" ? "follow" : "unfollow");
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
          isFollowing || isRequested
            ? "border-zinc-200 bg-zinc-100 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
            : "border-zinc-950 bg-transparent text-black hover:bg-black hover:text-white dark:border-zinc-100 dark:text-white dark:hover:bg-white dark:hover:text-black",
          className,
        )}
      >
        {isFollowing ? t("card.following") : isRequested ? t("relations.requested") : t("card.follow")}
      </Button>
      {confirmUnfollow && (
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent showCloseButton={false} className="z-[100] flex w-[320px] flex-col items-center gap-4 rounded-3xl border-zinc-200 bg-white p-6 text-center dark:border-zinc-900 dark:bg-zinc-950">
            <DialogHeader className="flex w-full flex-col items-center gap-3">
              <UserAvatar src={user.avatarUrl} name={user.displayName} className="mx-auto size-18 border border-zinc-100 shadow-sm dark:border-zinc-900" fallbackClassName="text-xl font-bold" />
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
                  commit("unfollow");
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

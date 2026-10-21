"use client";

import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import React, { useState } from "react";
import { UserAvatar } from "@/components/shared/user-avatar";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useActorId } from "@/features/auth";
import { useTranslation } from "@/hooks/use-translation";
import { ensureUser, useFollowState, useUser } from "../store/user-store";
import { parseBio } from "../utils/bio-parser";
import { FollowButton } from "./follow-button";

interface UserHoverCardProps {
  userId: string;
  /** The trigger: a link to the profile, so touch devices (no hover) simply navigate. */
  children: React.ReactElement;
}

type LoadStatus = "idle" | "loading" | "error";

/** Built once per locale, not per render. */
const COMPACT_FORMATS = {
  vi: new Intl.NumberFormat("vi-VN", { notation: "compact" }),
  en: new Intl.NumberFormat("en-US", { notation: "compact" }),
};

function HoverCardSkeleton() {
  return (
    <div data-testid="hover-card-skeleton" className="flex flex-col gap-3" aria-hidden="true">
      <Skeleton className="size-12 rounded-full" />
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-20" />
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-24" />
    </div>
  );
}

/** Author preview on hover (desktop): live from `user-store`, fetched once when not cached. */
export function UserHoverCard({ userId, children }: UserHoverCardProps) {
  const { t, locale } = useTranslation();
  const actorId = useActorId();
  const user = useUser(userId);
  const isFollowing = useFollowState(userId);
  // Data always comes from the store; local state tracks only the request
  const [status, setStatus] = useState<LoadStatus>("idle");

  const load = () => {
    setStatus("loading");
    ensureUser(userId, actorId)
      .then((loaded) => setStatus(loaded ? "idle" : "error"))
      .catch(() => setStatus("error"));
  };

  const handleOpenChange = (open: boolean) => {
    // Also when only this viewer's follow state is missing (user cached by another account)
    if (open && (!user || isFollowing === undefined) && status !== "loading") load();
  };

  // No self-preview: the viewer is not a mock user, so loading their card could only fail
  if (userId === actorId) return children;

  const compact = COMPACT_FORMATS[locale];

  return (
    <HoverCard openDelay={500} closeDelay={150} onOpenChange={handleOpenChange}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        align="start"
        className="w-72 rounded-2xl border-zinc-200/60 dark:border-zinc-800/60 bg-white dark:bg-zinc-950 p-4 shadow-xl"
      >
        {user ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <Link href={`/@${user.username}`} className="shrink-0">
                <UserAvatar src={user.avatarUrl} name={user.displayName} className="size-12 border border-zinc-100 dark:border-zinc-900" fallbackClassName="text-sm" />
              </Link>
              <FollowButton userId={user.id} />
            </div>
            <div className="flex flex-col min-w-0">
              <Link href={`/@${user.username}`} className="flex items-center gap-1 min-w-0 hover:underline">
                <span className="font-bold text-sm truncate text-black dark:text-zinc-100">{user.displayName}</span>
                {user.isVerified && <ShieldCheck className="size-4 text-blue-500 shrink-0 fill-blue-500/10" />}
              </Link>
              <span className="text-xs text-zinc-400 dark:text-zinc-500 truncate">@{user.username}</span>
            </div>
            {user.bio && (
              <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300 break-words">{parseBio(user.bio)}</p>
            )}
            <div className="flex items-center gap-4 text-xs text-zinc-500 dark:text-zinc-400">
              <span>
                <strong className="text-black dark:text-white">{compact.format(user.followersCount)}</strong>{" "}
                {t("hoverCard.followers")}
              </span>
              <span>
                <strong className="text-black dark:text-white">{compact.format(user.followingCount)}</strong>{" "}
                {t("hoverCard.following")}
              </span>
            </div>
          </div>
        ) : status === "error" ? (
          <div className="flex items-center justify-between gap-3 text-sm text-zinc-500 dark:text-zinc-400">
            <span>{t("hoverCard.loadError")}</span>
            <button
              type="button"
              onClick={load}
              className="min-h-11 px-4 rounded-full border border-zinc-200 dark:border-zinc-800 text-xs font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors motion-reduce:transition-none"
            >
              {t("hoverCard.retry")}
            </button>
          </div>
        ) : (
          <HoverCardSkeleton />
        )}
      </HoverCardContent>
    </HoverCard>
  );
}

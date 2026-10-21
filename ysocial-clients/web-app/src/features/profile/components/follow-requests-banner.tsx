"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { UserAvatar } from "@/components/shared/user-avatar";
import { GUEST_ACTOR_ID, useActorId } from "@/features/auth";
import { useTranslation } from "@/hooks/use-translation";
import { fetchFollowRequests } from "../services/relation-service";
import { ensureRelationSets, useFollowRequestCount, useFollowRequestsVersion, useRelationsLoaded } from "../store/relation-store";
import type { UserProfile } from "../types";

const PREVIEW_AVATARS = 3;

/** Notifications entry to the follow requests: 3 stacked avatars + the pending count. Hidden when there is nothing to review. */
export function FollowRequestsBanner() {
  const { t } = useTranslation();
  const actorId = useActorId();
  const loaded = useRelationsLoaded();
  const count = useFollowRequestCount();
  const version = useFollowRequestsVersion();
  const isGuest = actorId === GUEST_ACTOR_ID;
  const [preview, setPreview] = useState<UserProfile[]>([]);

  useEffect(() => {
    if (!isGuest) ensureRelationSets(actorId).catch(() => undefined);
  }, [actorId, isGuest]);

  // The previews follow the count (answered requests, going public); the last previews stay while the next ones load
  useEffect(() => {
    if (isGuest || !loaded || count === 0) return;
    let cancelled = false;
    fetchFollowRequests({ page: 1 }, actorId)
      .then(({ users }) => {
        if (!cancelled) setPreview(users.slice(0, PREVIEW_AVATARS));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [actorId, count, isGuest, loaded, version]);

  if (isGuest || !loaded || count === 0) return null;

  return (
    <Link
      href="/settings/privacy#requests"
      className="flex min-h-16 items-center gap-3 border-b border-zinc-100 px-6 py-3 transition-colors hover:bg-zinc-50 motion-reduce:transition-none dark:border-zinc-900 dark:hover:bg-zinc-900/40"
    >
      <div className="flex -space-x-3" aria-hidden="true">
        {preview.map((user) => (
          <UserAvatar key={user.id} src={user.avatarUrl} name={user.displayName} className="size-9 border-2 border-white dark:border-black" />
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">{t("notifications.followRequests", { count })}</span>
        <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">{t("notifications.followRequestsHint")}</span>
      </div>
      <ChevronRight className="size-4 shrink-0 text-zinc-400" aria-hidden="true" />
    </Link>
  );
}

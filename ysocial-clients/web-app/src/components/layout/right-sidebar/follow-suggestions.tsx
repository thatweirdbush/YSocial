"use client";

import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useActorId } from "@/features/auth";
import { fetchSuggestedUsers, FollowButton, useUser, useUserActions } from "@/features/profile";
import { useCachedResource } from "@/hooks/use-cached-resource";
import { useTranslation } from "@/hooks/use-translation";

const SUGGESTION_COUNT = 3;

function FollowSuggestionItem({ userId }: { userId: string }) {
  const user = useUser(userId);
  if (!user) return null;

  return (
    <div className="flex items-center justify-between gap-3 group">
      <Link href={`/@${user.username}`} className="flex items-center gap-3 min-w-0 hover:opacity-80 transition-opacity">
        <Avatar className="size-10 border border-zinc-100 dark:border-zinc-900 shrink-0">
          <AvatarImage src={user.avatarUrl} alt="" />
          <AvatarFallback className="bg-zinc-200 dark:bg-zinc-800 text-xs font-semibold">
            {user.displayName.charAt(0) || "U"}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col min-w-0">
          <span className="font-semibold text-sm truncate group-hover:text-zinc-600 dark:group-hover:text-zinc-200 transition-colors">
            {user.displayName}
          </span>
          <span className="text-zinc-400 text-xs truncate">@{user.username}</span>
        </div>
      </Link>
      <FollowButton userId={user.id} className="ml-1.5" />
    </div>
  );
}

function FollowSuggestionSkeleton() {
  return (
    <div className="flex items-center gap-3" aria-hidden="true">
      <Skeleton className="size-10 rounded-full shrink-0" />
      <div className="flex flex-col gap-1.5 flex-1">
        <Skeleton className="h-3.5 w-28" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  );
}

export function FollowSuggestions() {
  const { t } = useTranslation();
  const actorId = useActorId();
  const { upsertUsers } = useUserActions();
  // Ids are kept after following, so the list does not reshuffle under the cursor; cached per viewer
  const { data: ids, failed } = useCachedResource(`suggested-users:3:${actorId}`, async () => {
    const users = await fetchSuggestedUsers(SUGGESTION_COUNT, actorId);
    upsertUsers(users, actorId);
    return users.map((user) => user.id);
  });

  if (failed || ids?.length === 0) return null;

  return (
    <div className="bg-white/60 dark:bg-zinc-950/20 border border-zinc-200/40 dark:border-zinc-800/40 rounded-3xl p-5 flex flex-col gap-4 shrink-0">
      <h3 className="font-bold text-md tracking-tight">{t("feed.whoToFollow")}</h3>
      <div className="flex flex-col gap-4">
        {ids
          ? ids.map((id) => <FollowSuggestionItem key={id} userId={id} />)
          : Array.from({ length: SUGGESTION_COUNT }, (_, index) => <FollowSuggestionSkeleton key={index} />)}
      </div>
    </div>
  );
}

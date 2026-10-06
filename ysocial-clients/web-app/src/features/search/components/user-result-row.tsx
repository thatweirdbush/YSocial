"use client";

import Link from "next/link";
import { HighlightText } from "@/components/shared/highlight-text";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { FollowButton, useUser } from "@/features/profile";
import { useTranslation } from "@/hooks/use-translation";

interface UserResultRowProps {
  userId: string;
  tokens?: readonly string[];
}

const COMPACT_FORMATS = {
  vi: new Intl.NumberFormat("vi-VN", { notation: "compact", maximumFractionDigits: 1 }),
  en: new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }),
};

export function UserResultRow({ userId, tokens = [] }: UserResultRowProps) {
  const { t, locale } = useTranslation();
  const user = useUser(userId);
  if (!user) return null;

  return (
    <div className="flex min-h-[72px] items-center gap-3 px-4 py-3 transition-colors hover:bg-zinc-50 motion-reduce:transition-none dark:hover:bg-zinc-950">
      <Link href={`/@${user.username}`} className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar className="size-10 shrink-0 border border-zinc-100 dark:border-zinc-900">
          <AvatarImage src={user.avatarUrl} alt="" />
          <AvatarFallback className="bg-zinc-200 text-xs font-semibold dark:bg-zinc-800">{user.displayName.charAt(0)}</AvatarFallback>
        </Avatar>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold text-zinc-950 dark:text-zinc-50">
            <HighlightText text={user.displayName} tokens={tokens} />
          </span>
          <span className="truncate text-xs text-zinc-500">
            @<HighlightText text={user.username} tokens={tokens} /> · {t(user.followersCount === 1 ? "search.followersOne" : "search.followers", {
              count: COMPACT_FORMATS[locale].format(user.followersCount),
            })}
          </span>
          {user.bio && (
            <span className="mt-0.5 line-clamp-1 text-xs text-zinc-600 dark:text-zinc-400">
              <HighlightText text={user.bio} tokens={tokens} />
            </span>
          )}
        </span>
      </Link>
      <FollowButton userId={user.id} />
    </div>
  );
}

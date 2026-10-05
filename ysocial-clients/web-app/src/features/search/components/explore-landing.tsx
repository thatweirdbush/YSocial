"use client";

import { History, X } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchTrendingTags } from "@/features/posts";
import type { HashtagStat } from "@/features/posts/types";
import { fetchSuggestedUsers, useUserActions } from "@/features/profile";
import { useTranslation } from "@/hooks/use-translation";
import { buildSearchHref } from "../services/search-service";
import { useRecentSearches, useSearchActions } from "../store/search-store";
import { UserRowSkeleton } from "./search-skeleton";
import { TagResultRow } from "./tag-result-row";
import { UserResultRow } from "./user-result-row";

const TRENDING_COUNT = 6;
const SUGGESTED_COUNT = 5;

function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 pt-5 pb-2">
      <h2 className="text-sm font-bold text-zinc-950 dark:text-zinc-50">{title}</h2>
      {action}
    </div>
  );
}

function RecentSearches() {
  const { t } = useTranslation();
  const recent = useRecentSearches();
  const { removeRecent, clearRecent } = useSearchActions();

  if (recent.length === 0) return null;

  return (
    <section>
      <SectionHeader
        title={t("search.recent")}
        action={
          <button
            type="button"
            onClick={clearRecent}
            className="min-h-11 px-2 text-xs font-semibold text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            {t("search.clearAll")}
          </button>
        }
      />
      <ul className="flex flex-wrap gap-2 px-4 pb-2">
        {recent.map((query) => (
          <li
            key={query}
            className="flex items-center rounded-full border border-zinc-200/70 bg-zinc-50 text-sm dark:border-zinc-800/70 dark:bg-zinc-950"
          >
            <Link href={buildSearchHref(query)} className="flex min-h-11 items-center gap-1.5 pl-3 pr-1 text-zinc-800 dark:text-zinc-200">
              <History className="size-3.5 text-zinc-400" aria-hidden="true" />
              {query}
            </Link>
            <button
              type="button"
              onClick={() => removeRecent(query)}
              aria-label={t("search.removeRecent", { query })}
              className="flex size-11 items-center justify-center rounded-full text-zinc-400 transition-colors hover:text-zinc-800 dark:hover:text-zinc-100"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TagRowSkeleton() {
  return (
    <div className="flex h-14 items-center gap-3 px-4" aria-hidden="true">
      <Skeleton className="size-10 shrink-0 rounded-full bg-zinc-200 dark:bg-zinc-800" />
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-3.5 w-28 bg-zinc-200 dark:bg-zinc-800" />
        <Skeleton className="h-3 w-16 bg-zinc-200 dark:bg-zinc-800" />
      </div>
    </div>
  );
}

/** `/search` without a query: recent searches, trending hashtags, who to follow. */
export function ExploreLanding() {
  const { t } = useTranslation();
  const { upsertUsers } = useUserActions();
  const [tags, setTags] = useState<HashtagStat[] | null>(null);
  const [userIds, setUserIds] = useState<string[] | null>(null);

  useEffect(() => {
    let active = true;
    fetchTrendingTags(TRENDING_COUNT)
      .then((result) => active && setTags(result))
      .catch(() => active && setTags([]));
    fetchSuggestedUsers(SUGGESTED_COUNT)
      .then((users) => {
        if (!active) return;
        upsertUsers(users);
        setUserIds(users.map((user) => user.id));
      })
      .catch(() => active && setUserIds([]));
    return () => {
      active = false;
    };
  }, [upsertUsers]);

  return (
    <div className="flex flex-col divide-y divide-zinc-200/60 dark:divide-zinc-900/60">
      <RecentSearches />

      {tags?.length !== 0 && (
        <section className="pb-2">
          <SectionHeader title={t("search.trending")} />
          {tags
            ? tags.map((stat) => <TagResultRow key={stat.tag} stat={stat} />)
            : Array.from({ length: TRENDING_COUNT }, (_, index) => <TagRowSkeleton key={index} />)}
        </section>
      )}

      {userIds?.length !== 0 && (
        <section className="pb-2">
          <SectionHeader title={t("search.suggested")} />
          {userIds
            ? userIds.map((id) => <UserResultRow key={id} userId={id} />)
            : Array.from({ length: SUGGESTED_COUNT }, (_, index) => <UserRowSkeleton key={index} />)}
        </section>
      )}
    </div>
  );
}

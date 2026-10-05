"use client";

import { ChevronRight, TrendingUp } from "lucide-react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchTrendingTags } from "@/features/posts";
import { useCachedResource } from "@/hooks/use-cached-resource";
import { useTranslation } from "@/hooks/use-translation";

const TREND_COUNT = 3;

function TrendSkeleton() {
  return (
    <div className="flex flex-col gap-1.5" aria-hidden="true">
      <Skeleton className="h-4 w-36" />
      <Skeleton className="h-3 w-16" />
    </div>
  );
}

export function TrendingWidget() {
  const { t } = useTranslation();
  const { data: trends, failed } = useCachedResource("trending-tags:3", () => fetchTrendingTags(TREND_COUNT));

  if (failed || trends?.length === 0) return null;

  return (
    <div className="bg-white/60 dark:bg-zinc-950/20 border border-zinc-200/40 dark:border-zinc-800/40 rounded-3xl p-5 flex flex-col gap-4 shrink-0">
      <div className="flex items-center gap-2 font-bold text-md">
        <TrendingUp className="size-5 text-zinc-400 shrink-0" aria-hidden="true" />
        <h3 className="tracking-tight">{t("feed.trending")}</h3>
      </div>
      <div className="flex flex-col gap-2">
        {trends
          ? trends.map((trend) => (
              <Link
                key={trend.tag}
                href={`/tags/${encodeURIComponent(trend.tag)}`}
                className="flex min-h-11 items-center justify-between gap-3 group"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors">
                    #{trend.tag}
                  </span>
                  <span className="text-xs text-zinc-500 font-normal mt-0.5">{t("tags.postsCount", { count: trend.postsCount })}</span>
                </div>
                <ChevronRight className="size-4 text-zinc-300 dark:text-zinc-700 group-hover:translate-x-0.5 transition-transform motion-reduce:transition-none shrink-0" aria-hidden="true" />
              </Link>
            ))
          : Array.from({ length: TREND_COUNT }, (_, index) => <TrendSkeleton key={index} />)}
      </div>
    </div>
  );
}

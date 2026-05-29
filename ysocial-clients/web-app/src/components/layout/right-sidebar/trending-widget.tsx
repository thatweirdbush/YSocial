"use client";

import React from "react";
import { TrendingUp, ChevronRight } from "lucide-react";
import { useTranslation } from "@/hooks/use-translation";

export function TrendingWidget() {
  const { t } = useTranslation();

  const mockTrends = [
    { tag: "#YSocialNET", posts: "24.5K posts" },
    { tag: "#CleanArchitecture", posts: "12.2K posts" },
    { tag: "#LuxuryMinimalism", posts: "8.9K posts" },
  ];

  return (
    <div className="bg-white/60 dark:bg-zinc-950/20 border border-zinc-200/40 dark:border-zinc-800/40 rounded-3xl p-5 flex flex-col gap-4 shrink-0">
      <div className="flex items-center gap-2 font-bold text-md">
        <TrendingUp className="h-5 w-5 text-zinc-400 shrink-0" />
        <h3 className="tracking-tight">{t("feed.trending")}</h3>
      </div>
      <div className="flex flex-col gap-4">
        {mockTrends.map((trend, index) => (
          <div key={index} className="flex items-center justify-between gap-3 cursor-pointer group">
            <div className="flex flex-col">
              <span className="text-xs text-zinc-500 font-normal">Home • Trending</span>
              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 group-hover:text-zinc-650 dark:group-hover:text-zinc-350 transition-colors mt-0.5">
                {trend.tag}
              </span>
              <span className="text-xs text-zinc-500 font-normal mt-0.5">{trend.posts}</span>
            </div>
            <ChevronRight className="h-4 w-4 text-zinc-300 dark:text-zinc-700 group-hover:translate-x-0.5 transition-transform shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

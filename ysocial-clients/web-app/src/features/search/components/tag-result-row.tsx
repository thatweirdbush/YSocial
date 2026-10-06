"use client";

import { Hash } from "lucide-react";
import Link from "next/link";
import { HighlightText } from "@/components/shared/highlight-text";
import type { HashtagStat } from "@/features/posts/types";
import { useTranslation } from "@/hooks/use-translation";

interface TagResultRowProps {
  stat: HashtagStat;
  tokens?: readonly string[];
}

export function TagResultRow({ stat, tokens = [] }: TagResultRowProps) {
  const { t } = useTranslation();

  return (
    <Link
      href={`/tags/${encodeURIComponent(stat.tag)}`}
      className="flex min-h-14 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-zinc-50 motion-reduce:transition-none dark:hover:bg-zinc-950"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-900">
        <Hash className="size-4 text-zinc-500" aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-semibold text-zinc-950 dark:text-zinc-50">
          #<HighlightText text={stat.tag} tokens={tokens} />
        </span>
        <span className="text-xs text-zinc-500">{t(stat.postsCount === 1 ? "tags.postsCountOne" : "tags.postsCount", { count: stat.postsCount })}</span>
      </span>
    </Link>
  );
}

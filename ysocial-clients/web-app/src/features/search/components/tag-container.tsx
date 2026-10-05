"use client";

import { AlertCircle, Hash } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { fetchPostsByTag, PostCard, usePost, usePostActions } from "@/features/posts";
import type { TagSort } from "@/features/posts/types";
import { useTranslation } from "@/hooks/use-translation";
import { tagPageKey, useSearchActions, useTagPage } from "../store/search-store";
import { SearchShell } from "./search-shell";
import { SearchSkeleton } from "./search-skeleton";
import { TabBar } from "./tab-bar";

interface TagContainerProps {
  /** Decoded tag without `#`. */
  tag: string;
  sort: TagSort;
}

function TagPostCard({ id }: { id: string }) {
  const post = usePost(id);
  return post ? <PostCard post={post} /> : null;
}

/** `/tags/[tag]` body. Mount with `key={tag}`; sort switches keep state & reuse cached pages. */
export function TagContainer({ tag, sort: initialSort }: TagContainerProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { upsertPosts } = usePostActions();
  const { setTagPage } = useSearchActions();

  const [sort, setSort] = useState(initialSort);
  const [attempt, setAttempt] = useState(0);
  const [failedKey, setFailedKey] = useState<string | null>(null);

  const key = tagPageKey(tag, sort);
  const page = useTagPage(key);

  useEffect(() => {
    // Stale-while-revalidate: cached pages (Back, sort switched back) render at once, refetch replaces them silently
    let active = true;

    fetchPostsByTag(tag, sort)
      .then((result) => {
        if (!active) return;
        upsertPosts(result.posts);
        setTagPage(key, { tag: result.tag, postsCount: result.postsCount, postIds: result.posts.map((post) => post.id) });
      })
      .catch(() => active && setFailedKey(key));

    return () => {
      active = false;
    };
  }, [tag, sort, key, attempt, upsertPosts, setTagPage]);

  const tabs = useMemo(
    () => [
      { value: "top" as const, label: t("tags.top") },
      { value: "latest" as const, label: t("tags.latest") },
    ],
    [t],
  );

  const handleSortChange = (next: TagSort) => {
    setSort(next);
    router.replace(`/tags/${encodeURIComponent(tag)}?sort=${next}`, { scroll: false });
  };

  const handleRetry = () => {
    setFailedKey(null);
    setAttempt((n) => n + 1);
  };

  const displayTag = page?.tag ?? tag;

  const header = (
    <>
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-900">
          <Hash className="size-5 text-zinc-500" aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-col">
          <h1 className="truncate text-2xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">#{displayTag}</h1>
          <p className="h-5 text-sm text-zinc-500">{page && t("tags.postsCount", { count: page.postsCount })}</p>
        </div>
      </div>
      <TabBar tabs={tabs} active={sort} onChange={handleSortChange} label={`#${displayTag}`} />
    </>
  );

  let body;
  if (failedKey === key && !page) {
    body = (
      <EmptyState
        icon={AlertCircle}
        title={t("tags.error")}
        action={
          <button
            type="button"
            onClick={handleRetry}
            className="min-h-11 rounded-full border border-zinc-200 px-5 text-sm font-semibold transition-colors hover:bg-zinc-100 motion-reduce:transition-none dark:border-zinc-800 dark:hover:bg-zinc-900"
          >
            {t("search.retry")}
          </button>
        }
      />
    );
  } else if (!page) {
    body = <SearchSkeleton />;
  } else if (page.postsCount === 0) {
    body = (
      <EmptyState
        icon={Hash}
        title={t("tags.emptyTitle", { tag: displayTag })}
        description={t("tags.emptyDescription")}
        action={
          <Link
            href="/search"
            className="flex min-h-11 items-center rounded-full border border-zinc-200 px-5 text-sm font-semibold transition-colors hover:bg-zinc-100 motion-reduce:transition-none dark:border-zinc-800 dark:hover:bg-zinc-900"
          >
            {t("tags.emptyCta")}
          </Link>
        }
      />
    );
  } else {
    body = (
      <div className="flex flex-col divide-y divide-zinc-200/60 dark:divide-zinc-900/60">
        {page.postIds.map((id) => (
          <TagPostCard key={id} id={id} />
        ))}
      </div>
    );
  }

  return (
    <SearchShell header={header}>
      <div role="tabpanel" aria-label={tabs.find((tab) => tab.value === sort)?.label}>
        {body}
      </div>
    </SearchShell>
  );
}

"use client";

import { AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { byNewestPost, usePostActions } from "@/features/posts";
import { useUserActions } from "@/features/profile";
import { useTranslation } from "@/hooks/use-translation";
import { normalizeText, tokenize } from "@/lib/text";
import { buildSearchHref, fetchSearch } from "../services/search-service";
import { useSearchActions, useSearchResult } from "../store/search-store";
import { SEARCH_TABS, type SearchTab } from "../types";
import { ExploreLanding } from "./explore-landing";
import { SearchBox } from "./search-box";
import { SearchPanel } from "./search-panels";
import { SearchShell } from "./search-shell";
import { SearchSkeleton } from "./search-skeleton";
import { TabBar } from "./tab-bar";

type LoadStatus = "loading" | "error" | "ready";

const TAB_LABEL_KEYS = {
  top: "search.tabTop",
  users: "search.tabUsers",
  posts: "search.tabPosts",
  tags: "search.tabTags",
} as const;

interface SearchContainerProps {
  query: string;
  tab: SearchTab;
}

/** `/search` body. Mount with `key={query}`: a new query starts fresh, tab switches keep state. */
export function SearchContainer({ query, tab }: SearchContainerProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { upsertPosts } = usePostActions();
  const { upsertUsers } = useUserActions();
  const { setResult, addRecent } = useSearchActions();

  const hasQuery = tokenize(query.replace(/^[#@]/, "")).length > 0;
  const result = useSearchResult();
  const cached = hasQuery && result && normalizeText(result.query) === normalizeText(query) ? result : null;

  // A cached result (Back from a thread) renders at once; only the first mount decides
  const [skipFirstFetch] = useState(() => cached !== null);
  const [status, setStatus] = useState<LoadStatus>(cached ? "ready" : "loading");
  const [attempt, setAttempt] = useState(0);
  const [activeTab, setActiveTab] = useState(tab);

  useEffect(() => {
    if (!hasQuery || (attempt === 0 && skipFirstFetch)) return;
    let active = true;

    fetchSearch(query)
      .then(({ users, posts, tags }) => {
        if (!active) return;
        upsertPosts(posts);
        upsertUsers(users);
        setResult({
          query,
          userIds: users.map((user) => user.id),
          postIds: posts.map((post) => post.id),
          latestPostIds: [...posts].sort(byNewestPost).map((post) => post.id),
          tags,
        });
        addRecent(query);
        setStatus("ready");
      })
      .catch(() => active && setStatus("error"));

    return () => {
      active = false;
    };
  }, [query, hasQuery, attempt, skipFirstFetch, upsertPosts, upsertUsers, setResult, addRecent]);

  const tokens = useMemo(() => tokenize(query.replace(/^[#@]/, "")), [query]);
  const tabs = useMemo(() => SEARCH_TABS.map((value) => ({ value, label: t(TAB_LABEL_KEYS[value]) })), [t]);

  const handleTabChange = (next: SearchTab) => {
    setActiveTab(next);
    router.replace(buildSearchHref(query, next), { scroll: false });
  };

  const handleRetry = () => {
    setStatus("loading");
    setAttempt((n) => n + 1);
  };

  const header = (
    <>
      <div className="px-4 pt-3 pb-3">
        <SearchBox variant="page" defaultValue={query} autoFocus={!hasQuery} />
      </div>
      {hasQuery && <TabBar tabs={tabs} active={activeTab} onChange={handleTabChange} label={t("search.results")} />}
    </>
  );

  if (!hasQuery) {
    return (
      <SearchShell header={header}>
        <h1 className="sr-only">{t("search.exploreTitle")}</h1>
        <ExploreLanding />
      </SearchShell>
    );
  }

  return (
    <SearchShell header={header}>
      <h1 className="sr-only">{t("search.results")}</h1>
      <div role="tabpanel" aria-label={t(TAB_LABEL_KEYS[activeTab])}>
        {status === "error" ? (
          <EmptyState
            icon={AlertCircle}
            title={t("search.error")}
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
        ) : status === "loading" || !cached ? (
          <SearchSkeleton />
        ) : (
          <SearchPanel tab={activeTab} result={cached} tokens={tokens} onTabChange={handleTabChange} />
        )}
      </div>
    </SearchShell>
  );
}

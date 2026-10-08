"use client";

import { AlertCircle, SearchX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { useActorId } from "@/features/auth";
import { usePostActions } from "@/features/posts";
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
import { TabBar, tabId } from "./tab-bar";

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
  const actorId = useActorId();
  const { upsertUsers } = useUserActions();
  const { setResult, addRecent } = useSearchActions();

  const hasQuery = tokenize(query.replace(/^[#@]/, "")).length > 0;
  const result = useSearchResult();
  const cached = hasQuery && result && normalizeText(result.query) === normalizeText(query) ? result : null;

  // Stale-while-revalidate: a cached result (Back from a thread) renders at once, the refetch replaces it silently
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [activeTab, setActiveTab] = useState(tab);
  const panelId = useId();

  // Same-query navigation (e.g. resubmitting from the Users tab) changes the tab prop without a remount
  const [syncedTab, setSyncedTab] = useState(tab);
  if (tab !== syncedTab) {
    setSyncedTab(tab);
    setActiveTab(tab);
  }

  useEffect(() => {
    if (!hasQuery) return;
    let active = true;

    fetchSearch(query, actorId)
      .then(({ users, posts, latestPosts, tags }) => {
        if (!active) return;
        upsertPosts([...posts, ...latestPosts]);
        upsertUsers(users, actorId);
        setResult({
          query,
          userIds: users.map((user) => user.id),
          postIds: posts.map((post) => post.id),
          latestPostIds: latestPosts.map((post) => post.id),
          tags,
        });
        addRecent(query);
      })
      .catch(() => active && setFailed(true));

    return () => {
      active = false;
    };
  }, [query, hasQuery, attempt, actorId, upsertPosts, upsertUsers, setResult, addRecent]);

  const tokens = useMemo(() => tokenize(query.replace(/^[#@]/, "")), [query]);
  const tabs = useMemo(() => SEARCH_TABS.map((value) => ({ value, label: t(TAB_LABEL_KEYS[value]) })), [t]);

  const handleTabChange = (next: SearchTab) => {
    setActiveTab(next);
    router.replace(buildSearchHref(query, next), { scroll: false });
  };

  const handleRetry = () => {
    setFailed(false);
    setAttempt((n) => n + 1);
  };

  const header = (
    <>
      <div className="px-4 pt-3 pb-3">
        <SearchBox variant="page" defaultValue={query} autoFocus={!hasQuery} />
      </div>
      {hasQuery && <TabBar tabs={tabs} active={activeTab} onChange={handleTabChange} label={t("search.results")} panelId={panelId} />}
    </>
  );

  if (!query.trim()) {
    return (
      <SearchShell header={header}>
        <h1 className="sr-only">{t("search.exploreTitle")}</h1>
        <ExploreLanding />
      </SearchShell>
    );
  }

  // Bare `#` / `@`: nothing searchable, but the user did search -> empty result, not the landing
  if (!hasQuery) {
    return (
      <SearchShell header={header}>
        <h1 className="sr-only">{t("search.results")}</h1>
        <EmptyState icon={SearchX} title={t("search.emptyTitle", { query: query.trim() })} />
      </SearchShell>
    );
  }

  return (
    <SearchShell header={header}>
      <h1 className="sr-only">{t("search.results")}</h1>
      <div role="tabpanel" id={panelId} aria-labelledby={tabId(panelId, activeTab)}>
        {cached ? (
          <SearchPanel tab={activeTab} result={cached} tokens={tokens} onTabChange={handleTabChange} />
        ) : failed ? (
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
        ) : (
          <SearchSkeleton />
        )}
      </div>
    </SearchShell>
  );
}

"use client";

import { Hash, SearchX, UserRoundSearch } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PostCard, usePost } from "@/features/posts";
import { useTranslation } from "@/hooks/use-translation";
import type { SearchResult, SearchTab } from "../types";
import { TagResultRow } from "./tag-result-row";
import { UserResultRow } from "./user-result-row";

const TOP_USER_COUNT = 3;

interface PanelProps {
  result: SearchResult;
  tokens: readonly string[];
}

function SearchPostCard({ id, tokens }: { id: string; tokens: readonly string[] }) {
  const post = usePost(id);
  return post ? <PostCard post={post} highlightTokens={tokens} /> : null;
}

function PostList({ ids, tokens }: { ids: string[]; tokens: readonly string[] }) {
  return (
    <div className="flex flex-col divide-y divide-zinc-200/60 dark:divide-zinc-900/60">
      {ids.map((id) => (
        <SearchPostCard key={id} id={id} tokens={tokens} />
      ))}
    </div>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <h2 className="px-4 pt-5 pb-2 text-sm font-bold text-zinc-950 dark:text-zinc-50">{children}</h2>;
}

function NoResults({ query, icon = SearchX, description }: { query: string; icon?: LucideIcon; description?: string }) {
  const { t } = useTranslation();
  return <EmptyState icon={icon} title={t("search.emptyTitle", { query })} description={description} />;
}

function TopPanel({ result, tokens, onSeeAllUsers }: PanelProps & { onSeeAllUsers: () => void }) {
  const { t } = useTranslation();
  const { userIds, postIds } = result;

  if (userIds.length === 0 && postIds.length === 0) return <NoResults query={result.query} />;

  return (
    <>
      {userIds.length > 0 && (
        <section className="border-b border-zinc-200/60 dark:border-zinc-900/60">
          <SectionTitle>{t("search.users")}</SectionTitle>
          {userIds.slice(0, TOP_USER_COUNT).map((id) => (
            <UserResultRow key={id} userId={id} tokens={tokens} />
          ))}
          {userIds.length > TOP_USER_COUNT && (
            <button
              type="button"
              onClick={onSeeAllUsers}
              className="min-h-11 w-full px-4 text-left text-sm font-semibold text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-zinc-900 motion-reduce:transition-none dark:hover:bg-zinc-950 dark:hover:text-zinc-100"
            >
              {t("search.seeAllUsers")}
            </button>
          )}
        </section>
      )}
      <PostList ids={postIds} tokens={tokens} />
    </>
  );
}

interface SearchPanelProps extends PanelProps {
  tab: SearchTab;
  onTabChange: (tab: SearchTab) => void;
}

/** Results of the active search tab, each with its own empty state. */
export function SearchPanel({ tab, result, tokens, onTabChange }: SearchPanelProps) {
  const { t } = useTranslation();

  switch (tab) {
    case "top":
      return <TopPanel result={result} tokens={tokens} onSeeAllUsers={() => onTabChange("users")} />;
    case "users":
      return result.userIds.length === 0 ? (
        <NoResults query={result.query} icon={UserRoundSearch} description={t("search.emptyUsers")} />
      ) : (
        <div className="flex flex-col">
          {result.userIds.map((id) => (
            <UserResultRow key={id} userId={id} tokens={tokens} />
          ))}
        </div>
      );
    case "posts":
      return result.latestPostIds.length === 0 ? (
        <NoResults query={result.query} description={t("search.emptyPosts")} />
      ) : (
        <PostList ids={result.latestPostIds} tokens={tokens} />
      );
    case "tags":
      return result.tags.length === 0 ? (
        <NoResults query={result.query} icon={Hash} description={t("search.emptyTags")} />
      ) : (
        <div className="flex flex-col">
          {result.tags.map((stat) => (
            <TagResultRow key={stat.tag} stat={stat} tokens={tokens} />
          ))}
        </div>
      );
  }
}

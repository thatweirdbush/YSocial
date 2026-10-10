"use client";

import { AlertCircle, SearchX, UserX } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useTranslation, type TranslationKey } from "@/hooks/use-translation";
import type { FollowListPage, RelationListQuery, UserProfile } from "../types";

const SEARCH_DEBOUNCE_MS = 300;
const SKELETON_ROWS = 6;

export interface RelationRowControls {
  /** Removes the row at once; the returned function puts it back at its place (rollback of a failed action). */
  removeRow: (id: string) => () => void;
}

interface RelationUserListProps {
  /** MUST be stable (memoized): a new identity reloads the first page. */
  fetchPage: (query: RelationListQuery) => Promise<FollowListPage>;
  renderAction: (user: UserProfile, controls: RelationRowControls) => React.ReactNode;
  emptyTitle: TranslationKey;
  emptyDescription: TranslationKey;
  searchLabel: TranslationKey;
  /** Bump to reload the first page (e.g. the request count changed elsewhere). */
  reloadKey?: number;
}

interface ListState {
  key: string;
  users: UserProfile[];
  nextPage?: number;
  status: "ready" | "error";
  loadingMore: boolean;
  loadMoreError: boolean;
}

/**
 * Searchable, pageable list of users with a per-row action slot. Shared by the follow requests, blocked, muted &
 * close friends lists. The rows are kept locally (they are managed lists, not part of the user cache); only the
 * latest request may land, so a slow response of an older query never replaces a newer one.
 */
export function RelationUserList({ fetchPage, renderAction, emptyTitle, emptyDescription, searchLabel, reloadKey = 0 }: RelationUserListProps) {
  const { t } = useTranslation();
  const [queryInput, setQueryInput] = useState("");
  const query = useDebouncedValue(queryInput.trim(), SEARCH_DEBOUNCE_MS);
  const [nonce, setNonce] = useState(0);
  const key = `${query}|${reloadKey}|${nonce}`;
  const [list, setList] = useState<ListState | null>(null);
  const latestRequest = useRef(0);

  // First page whenever the (debounced) query, the reload key or the retry nonce changes
  useEffect(() => {
    const request = (latestRequest.current += 1);
    fetchPage({ query, page: 1 })
      .then(({ users, nextPage }) => {
        if (latestRequest.current === request) setList({ key, users, nextPage, status: "ready", loadingMore: false, loadMoreError: false });
      })
      .catch(() => {
        if (latestRequest.current === request) setList({ key, users: [], status: "error", loadingMore: false, loadMoreError: false });
      });
  }, [fetchPage, key, query]);

  const current = list?.key === key ? list : null;
  const nextPage = current?.nextPage;

  const loadMore = useCallback(() => {
    if (nextPage === undefined || current?.loadingMore) return;
    const request = (latestRequest.current += 1);
    setList((state) => (state ? { ...state, loadingMore: true, loadMoreError: false } : state));
    fetchPage({ query, page: nextPage })
      .then(({ users, nextPage: following }) => {
        if (latestRequest.current !== request) return;
        setList((state) => {
          if (!state || state.key !== key) return state;
          const known = new Set(state.users.map((item) => item.id));
          return { ...state, users: [...state.users, ...users.filter((item) => !known.has(item.id))], nextPage: following, loadingMore: false };
        });
      })
      .catch(() => {
        if (latestRequest.current === request) setList((state) => (state ? { ...state, loadingMore: false, loadMoreError: true } : state));
      });
  }, [current?.loadingMore, fetchPage, key, nextPage, query]);

  const removeRow = useCallback((id: string) => {
    let removed: { user: UserProfile; index: number } | undefined;
    setList((state) => {
      if (!state) return state;
      const index = state.users.findIndex((item) => item.id === id);
      if (index < 0) return state;
      removed = { user: state.users[index], index };
      return { ...state, users: state.users.filter((item) => item.id !== id) };
    });
    return () => {
      const target = removed;
      if (!target) return;
      setList((state) => {
        if (!state || state.users.some((item) => item.id === target.user.id)) return state;
        const users = [...state.users];
        users.splice(Math.min(target.index, users.length), 0, target.user);
        return { ...state, users };
      });
    };
  }, []);

  const retryFirstPage = () => setNonce((n) => n + 1);

  let body: React.ReactNode;
  if (!current) {
    body = (
      <div data-testid="relation-list-skeleton" aria-hidden="true" className="flex flex-col gap-4 px-4 py-3">
        {Array.from({ length: SKELETON_ROWS }).map((_, index) => (
          <div key={index} className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-full" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        ))}
      </div>
    );
  } else if (current.status === "error") {
    body = (
      <EmptyState
        icon={AlertCircle}
        title={t("profile.tabError")}
        action={
          <Button type="button" variant="outline" onClick={retryFirstPage} className="min-h-11 rounded-full px-5">
            {t("relations.retry")}
          </Button>
        }
      />
    );
  } else if (current.users.length === 0) {
    body = query ? (
      <EmptyState icon={SearchX} title={t("profile.followNoMatch", { query })} />
    ) : (
      <EmptyState icon={UserX} title={t(emptyTitle)} description={t(emptyDescription)} />
    );
  } else {
    body = (
      <ul className="flex flex-col">
        {current.users.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3 border-b border-zinc-200/50 px-4 py-3 last:border-0 dark:border-zinc-900/50">
            <Link
              href={`/@${item.username}`}
              className="flex min-w-0 items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 dark:focus-visible:ring-zinc-100"
            >
              <Avatar className="size-10 shrink-0 border border-zinc-300 dark:border-zinc-900">
                <AvatarImage src={item.avatarUrl} alt="" />
                <AvatarFallback className="bg-zinc-200 text-xs font-semibold dark:bg-zinc-800">
                  {item.displayName.charAt(0).toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">{item.displayName}</span>
                <span className="truncate text-xs text-zinc-400">@{item.username}</span>
              </span>
            </Link>
            <div className="flex shrink-0 items-center gap-2">{renderAction(item, { removeRow })}</div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="px-4 py-3">
        <Input
          type="search"
          value={queryInput}
          onChange={(event) => setQueryInput(event.target.value)}
          placeholder={t(searchLabel)}
          aria-label={t(searchLabel)}
          className="min-h-11 rounded-xl border-zinc-200/70 focus-visible:ring-2 focus-visible:ring-zinc-400 dark:border-zinc-900 dark:bg-black"
        />
      </div>
      {body}
      {current && current.status === "ready" && nextPage !== undefined && (
        <div className="flex items-center justify-center gap-3 px-4 py-4 text-sm text-zinc-500">
          {current.loadMoreError && <span>{t("profile.tabError")}</span>}
          <Button type="button" variant="outline" onClick={loadMore} disabled={current.loadingMore} className="min-h-11 rounded-full px-5">
            {current.loadMoreError ? t("relations.retry") : t("relations.loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}

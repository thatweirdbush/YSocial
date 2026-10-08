"use client";

import { SearchX, UserX } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useActorId, useViewerId } from "@/features/auth";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useTranslation } from "@/hooks/use-translation";
import { fetchFollowList } from "../services/user-service";
import { useUser, useUserActions } from "../store/user-store";
import type { FollowListKind } from "../types";
import { FollowButton } from "./follow-button";

export const FOLLOW_SEARCH_DEBOUNCE_MS = 250;

interface FollowersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  username: string;
  initialKind: FollowListKind;
}

export function FollowersDialog({ open, onOpenChange, userId, username, initialKind }: FollowersDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-50 flex h-[560px] max-h-[85vh] w-[95vw] max-w-sm flex-col overflow-hidden rounded-3xl border-zinc-200/50 bg-white p-0 shadow-2xl dark:border-zinc-900 dark:bg-zinc-950 [&>button]:hidden">
        {/* Mounted only while open: every open starts on the requested kind with a clean query */}
        <FollowersDialogBody userId={userId} username={username} initialKind={initialKind} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

interface ListState {
  /** `kind|query` the list belongs to; a different current key means the list is still loading. */
  key: string;
  ids: string[];
  nextPage?: number;
  status: "ready" | "error";
  loadingMore: boolean;
}

function FollowersDialogBody({
  userId,
  username,
  initialKind,
  onClose,
}: Pick<FollowersDialogProps, "userId" | "username" | "initialKind"> & { onClose: () => void }) {
  const { t, locale } = useTranslation();
  const actorId = useActorId();
  const { upsertUsers } = useUserActions();
  const owner = useUser(userId);

  const [kind, setKind] = useState<FollowListKind>(initialKind);
  const [queryInput, setQueryInput] = useState("");
  const query = useDebouncedValue(queryInput.trim(), FOLLOW_SEARCH_DEBOUNCE_MS);
  const key = `${kind}|${query}`;

  const [list, setList] = useState<ListState | null>(null);
  const token = useRef(0);

  // First page whenever kind or (debounced) query changes; a newer request invalidates older ones
  useEffect(() => {
    const request = (token.current += 1);
    fetchFollowList(userId, kind, { query, page: 1 }, actorId)
      .then(({ users, nextPage }) => {
        if (token.current !== request) return;
        upsertUsers(users, actorId);
        setList({ key, ids: users.map((user) => user.id), nextPage, status: "ready", loadingMore: false });
      })
      .catch(() => {
        if (token.current === request) setList({ key, ids: [], status: "error", loadingMore: false });
      });
  }, [actorId, key, kind, query, upsertUsers, userId]);

  const current = list?.key === key ? list : null;
  const nextPage = current?.nextPage;
  const loadingMore = current?.loadingMore ?? false;

  const loadMore = useCallback(() => {
    if (nextPage === undefined || loadingMore) return;
    const request = (token.current += 1);
    setList((state) => (state ? { ...state, loadingMore: true } : state));
    fetchFollowList(userId, kind, { query, page: nextPage }, actorId)
      .then(({ users, nextPage: following }) => {
        if (token.current !== request) return;
        upsertUsers(users, actorId);
        setList((state) => {
          if (!state || state.key !== key) return state;
          const known = new Set(state.ids);
          return {
            ...state,
            ids: [...state.ids, ...users.map((user) => user.id).filter((id) => !known.has(id))],
            nextPage: following,
            loadingMore: false,
          };
        });
      })
      .catch(() => {
        if (token.current === request) setList((state) => (state ? { ...state, loadingMore: false } : state));
      });
  }, [actorId, key, kind, loadingMore, nextPage, query, upsertUsers, userId]);

  const sentinelRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    const target = sentinelRef.current;
    if (!target || nextPage === undefined) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: "200px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [loadMore, nextPage, current?.ids.length]);

  const formatCount = (n: number | undefined) => (n === undefined ? "" : new Intl.NumberFormat(locale).format(n));
  const title = t(kind === "followers" ? "profile.followersTitle" : "profile.followingTitle");

  return (
    <>
      <DialogTitle className="sr-only">{title}</DialogTitle>
      <DialogDescription className="sr-only">@{username}</DialogDescription>

      <Tabs value={kind} onValueChange={(value) => setKind(value as FollowListKind)} className="shrink-0">
        <TabsList className="mb-1 grid h-auto! w-full grid-cols-2 rounded-none bg-transparent px-0">
          {(["followers", "following"] as const).map((value) => (
            <TabsTrigger
              key={value}
              value={value}
              className="flex min-h-11 flex-col items-center justify-center gap-1 rounded-none border-x-0 border-b border-t-0 border-zinc-200/50 bg-transparent py-3.5 font-medium text-zinc-400 transition-colors hover:text-zinc-600 motion-reduce:transition-none data-[state=active]:border-black data-[state=active]:bg-transparent! data-[state=active]:font-bold data-[state=active]:text-zinc-900 data-[state=active]:shadow-none! dark:text-zinc-500 dark:hover:text-zinc-300 dark:data-[state=active]:border-white dark:data-[state=active]:text-zinc-100"
            >
              <span className="text-sm leading-none">{t(value === "followers" ? "profile.followersTitle" : "profile.followingTitle")}</span>
              <span className="mt-0.5 text-xs leading-none">{formatCount(value === "followers" ? owner?.followersCount : owner?.followingCount)}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="shrink-0 px-5 pb-3">
        <Input
          type="search"
          value={queryInput}
          onChange={(event) => setQueryInput(event.target.value)}
          placeholder={t("profile.followSearchPlaceholder")}
          aria-label={t("profile.followSearchPlaceholder")}
          className="min-h-11 rounded-xl border-zinc-200/70 focus-visible:ring-2 focus-visible:ring-zinc-400 dark:border-zinc-900 dark:bg-black"
        />
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {!current ? (
          <RowsSkeleton />
        ) : current.ids.length === 0 ? (
          <EmptyState
            icon={query ? SearchX : UserX}
            title={query ? t("profile.followNoMatch", { query }) : t(kind === "followers" ? "profile.emptyFollowers" : "profile.emptyFollowing")}
          />
        ) : (
          <ul className="flex flex-col px-5 pb-4">
            {current.ids.map((id) => (
              <FollowRow key={id} id={id} onNavigate={onClose} />
            ))}
            {nextPage !== undefined && (
              <li ref={sentinelRef} aria-hidden="true" className="h-8">
                {loadingMore && <Skeleton className="h-8 w-full rounded-xl" />}
              </li>
            )}
          </ul>
        )}
      </ScrollArea>
    </>
  );
}

function FollowRow({ id, onNavigate }: { id: string; onNavigate: () => void }) {
  const user = useUser(id);
  const viewerId = useViewerId();
  if (!user) return null;

  return (
    <li className="flex items-center justify-between gap-3 border-b border-zinc-200/50 py-3 last:border-0 dark:border-zinc-900/50">
      <Link href={`/@${user.username}`} onClick={onNavigate} className="flex min-w-0 items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 dark:focus-visible:ring-zinc-100">
        <Avatar className="size-9 shrink-0 border border-zinc-300 dark:border-zinc-900">
          <AvatarImage src={user.avatarUrl} alt="" />
          <AvatarFallback className="bg-zinc-200 text-xs font-semibold dark:bg-zinc-800">{user.displayName.charAt(0).toUpperCase() || "U"}</AvatarFallback>
        </Avatar>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">{user.displayName}</span>
          <span className="truncate text-xs text-zinc-400">@{user.username}</span>
        </span>
      </Link>
      {user.id !== viewerId && <FollowButton userId={user.id} confirmUnfollow />}
    </li>
  );
}

function RowsSkeleton() {
  return (
    <div className="flex flex-col gap-4 px-5 py-3" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

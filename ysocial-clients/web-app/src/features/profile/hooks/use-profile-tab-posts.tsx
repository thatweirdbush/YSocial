"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useReducer, useRef } from "react";
import { fetchSavedPosts, fetchUserPosts, usePostActions } from "@/features/posts";
import type { ParentReference, PostItem } from "@/features/posts/types";
import type { ProfileTab } from "../types";

// Profile-local list state (spec D4/D19): tabs hold ordered ids + reply parent references; the posts themselves
// live in `post-store`. Lives in a controller above the panels, so a panel may unmount on tab switch while the
// list survives for as long as the profile is mounted.

export type TabStatus = "idle" | "loading" | "ready" | "error";

export interface ProfileTabState {
  ids: string[];
  parents: Record<string, ParentReference>;
  status: TabStatus;
  nextPage?: number;
}

type TabsState = Record<ProfileTab, ProfileTabState>;

/** `scopeKey` ties the lists to `userId:actorId` (Saved is actor-owned, like/bookmark flags are actor-scoped). */
interface ControllerState {
  scopeKey: string;
  tabs: TabsState;
}

export interface ProfileTabPostsController {
  scopeKey: string;
  state: TabsState;
  activate: (tab: ProfileTab) => void;
  loadMore: (tab: ProfileTab) => void;
  retry: (tab: ProfileTab) => void;
}

type Action =
  | { type: "start"; scopeKey: string; tab: ProfileTab }
  | { type: "success"; scopeKey: string; tab: ProfileTab; ids: string[]; parents: ParentReference[]; nextPage?: number; append: boolean }
  | { type: "failure"; scopeKey: string; tab: ProfileTab };

const IDLE: ProfileTabState = { ids: [], parents: {}, status: "idle" };
const TABS: readonly ProfileTab[] = ["threads", "replies", "media", "saved"];

const freshTabs = (): TabsState => ({ threads: IDLE, replies: IDLE, media: IDLE, saved: IDLE });

function reducer(state: ControllerState, action: Action): ControllerState {
  // A scope change starts from empty lists; late results of another scope never land
  const base = state.scopeKey === action.scopeKey ? state : { scopeKey: action.scopeKey, tabs: freshTabs() };
  if (action.type !== "start" && base !== state) return state;

  const current = base.tabs[action.tab];
  switch (action.type) {
    case "start":
      return { ...base, tabs: { ...base.tabs, [action.tab]: { ...current, status: "loading" } } };
    case "failure":
      return { ...base, tabs: { ...base.tabs, [action.tab]: { ...current, status: "error" } } };
    case "success": {
      const known = action.append ? new Set(current.ids) : new Set<string>();
      const ids = [...(action.append ? current.ids : []), ...action.ids.filter((id) => !known.has(id))];
      const parents = { ...(action.append ? current.parents : {}) };
      for (const parent of action.parents) parents[parent.id] = parent;
      return { ...base, tabs: { ...base.tabs, [action.tab]: { ids, parents, status: "ready", nextPage: action.nextPage } } };
    }
  }
}

export function useProfileTabPostsController(userId: string, actorId: string): ProfileTabPostsController {
  const scopeKey = `${userId}:${actorId}`;
  const { upsertPosts } = usePostActions();
  const [raw, dispatch] = useReducer(reducer, undefined, () => ({ scopeKey, tabs: freshTabs() }));
  const state = raw.scopeKey === scopeKey ? raw.tabs : IDLE_TABS;

  // Request tokens: only the latest request per tab may apply; a scope change invalidates every tab
  const tokens = useRef<Record<ProfileTab, number>>({ threads: 0, replies: 0, media: 0, saved: 0 });
  const seenScope = useRef(scopeKey);
  const latest = useRef({ state, scopeKey });
  // Tracks the scope each tab already kicked a fetch off for (StrictMode double-invokes effects before the
  // `start` dispatch commits, so a state-only idle check would fire the request twice for the same scope)
  const activatedScope = useRef<Record<ProfileTab, string | undefined>>({
    threads: undefined,
    replies: undefined,
    media: undefined,
    saved: undefined,
  });
  // Layout effects run before any child passive effect, so `activate` always sees the committed scope & lists
  useLayoutEffect(() => {
    if (seenScope.current !== scopeKey) {
      seenScope.current = scopeKey;
      for (const tab of TABS) tokens.current[tab] += 1;
    }
    latest.current = { state, scopeKey };
  });

  const fetchTab = useCallback(
    async (tab: ProfileTab, page: number, append: boolean) => {
      const token = (tokens.current[tab] += 1);
      dispatch({ type: "start", scopeKey, tab });
      try {
        const result: { posts: PostItem[]; parents?: ParentReference[]; nextPage?: number } =
          tab === "saved" ? await fetchSavedPosts(actorId, page) : await fetchUserPosts(userId, tab, page);
        if (tokens.current[tab] !== token) return;
        upsertPosts(result.posts);
        dispatch({
          type: "success",
          scopeKey,
          tab,
          ids: result.posts.map((post) => post.id),
          parents: result.parents ?? [],
          nextPage: result.nextPage,
          append,
        });
      } catch {
        if (tokens.current[tab] === token) dispatch({ type: "failure", scopeKey, tab });
      }
    },
    [actorId, scopeKey, upsertPosts, userId],
  );

  const activate = useCallback(
    (tab: ProfileTab) => {
      if (activatedScope.current[tab] === scopeKey) return;
      const current = latest.current.scopeKey === scopeKey ? latest.current.state[tab] : IDLE;
      if (current.status === "idle") {
        activatedScope.current[tab] = scopeKey;
        void fetchTab(tab, 1, false);
      }
    },
    [fetchTab, scopeKey],
  );

  const loadMore = useCallback(
    (tab: ProfileTab) => {
      const current = latest.current.state[tab];
      if (current.status === "ready" && current.nextPage !== undefined) void fetchTab(tab, current.nextPage, true);
    },
    [fetchTab],
  );

  const retry = useCallback(
    (tab: ProfileTab) => {
      const { nextPage } = latest.current.state[tab];
      void fetchTab(tab, nextPage ?? 1, nextPage !== undefined);
    },
    [fetchTab],
  );

  return useMemo(() => ({ scopeKey, state, activate, loadMore, retry }), [scopeKey, state, activate, loadMore, retry]);
}

const IDLE_TABS = freshTabs();

const ProfileTabPostsContext = createContext<ProfileTabPostsController | null>(null);

export function ProfileTabPostsProvider({ value, children }: { value: ProfileTabPostsController; children: React.ReactNode }) {
  return <ProfileTabPostsContext.Provider value={value}>{children}</ProfileTabPostsContext.Provider>;
}

export interface ProfileTabPosts {
  ids: string[];
  parents: Record<string, ParentReference>;
  status: TabStatus;
  hasMore: boolean;
  loadMore: () => void;
  retry: () => void;
}

/** One tab's list from the nearest controller; activating a tab fetches its first page once per scope. */
export function useProfileTabPosts(tab: ProfileTab): ProfileTabPosts {
  const controller = useContext(ProfileTabPostsContext);
  if (!controller) throw new Error("useProfileTabPosts must be used inside <ProfileTabPostsProvider>");
  const { activate, loadMore, retry, scopeKey, state } = controller;

  useEffect(() => {
    activate(tab);
  }, [activate, tab, scopeKey]);

  const current = state[tab];
  return {
    ids: current.ids,
    parents: current.parents,
    status: current.status,
    hasMore: current.status === "ready" && current.nextPage !== undefined,
    loadMore: useCallback(() => loadMore(tab), [loadMore, tab]),
    retry: useCallback(() => retry(tab), [retry, tab]),
  };
}

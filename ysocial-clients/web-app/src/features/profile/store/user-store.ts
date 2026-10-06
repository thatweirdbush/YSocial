import { useMemo } from "react";
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { useViewerId } from "@/features/auth";
import { fetchFollowedIds, fetchUser } from "../services/user-service";
import type { UserProfile, UserProfileBase, ViewerFollows } from "../types";

// Normalized client cache of users. Profile data is shared by every viewer; follow flags live in a
// per-viewer projection, so switching account never leaks `isFollowing`. Every screen reads the same
// entity via useUser(id), so follow changes are reflected everywhere in O(1).

interface UserStoreData {
  users: Record<string, UserProfileBase>;
  follows: Record<string, ViewerFollows>;
}

interface UserStoreActions {
  /** Shared data -> `users`; each `isFollowing` -> the viewer's projection (does not mark it loaded). */
  upsertUsers: (users: UserProfile[], viewerId: string) => void;
  /** Flips the viewer's follow & adjusts the shared `followersCount`; unknown id -> no-op. */
  toggleFollow: (viewerId: string, id: string) => void;
  /** Replaces the viewer's follow set; ignored (returns false) when a toggle happened since `sinceVersion`. */
  setFollowedIds: (viewerId: string, ids: string[], sinceVersion: number) => boolean;
}

interface UserStoreState extends UserStoreData {
  actions: UserStoreActions;
}

const EMPTY_FOLLOWS: ViewerFollows = Object.freeze({ ids: {}, loaded: false, version: 0 }) as ViewerFollows;

const initialData = (): UserStoreData => ({ users: {}, follows: {} });

export const useUserStore = create<UserStoreState>((set, get) => ({
  ...initialData(),
  actions: {
    upsertUsers: (users, viewerId) =>
      set((state) => {
        const next = { ...state.users };
        const current = state.follows[viewerId] ?? EMPTY_FOLLOWS;
        const ids = { ...current.ids };
        for (const { isFollowing, ...base } of users) {
          next[base.id] = base;
          if (isFollowing) ids[base.id] = true;
          else delete ids[base.id];
        }
        return { users: next, follows: { ...state.follows, [viewerId]: { ...current, ids } } };
      }),

    toggleFollow: (viewerId, id) =>
      set((state) => {
        const user = state.users[id];
        if (!user) return state;
        const current = state.follows[viewerId] ?? EMPTY_FOLLOWS;
        const following = !current.ids[id];
        const ids = { ...current.ids };
        if (following) ids[id] = true;
        else delete ids[id];
        return {
          users: { ...state.users, [id]: { ...user, followersCount: Math.max(0, user.followersCount + (following ? 1 : -1)) } },
          follows: { ...state.follows, [viewerId]: { ...current, ids, version: current.version + 1 } },
        };
      }),

    setFollowedIds: (viewerId, ids, sinceVersion) => {
      const current = get().follows[viewerId] ?? EMPTY_FOLLOWS;
      if (current.version !== sinceVersion) return false;
      const next: Record<string, true> = {};
      for (const id of ids) next[id] = true;
      set((state) => ({ follows: { ...state.follows, [viewerId]: { ids: next, loaded: true, version: current.version } } }));
      return true;
    },
  },
}));

const userRequests = new Map<string, Promise<UserProfile | null>>();
const followGraphRequests = new Map<string, Promise<void>>();

/** Test-only: clear cached data & in-flight requests, keep actions. */
export const resetUserStore = () => {
  userRequests.clear();
  followGraphRequests.clear();
  useUserStore.setState(initialData());
};

function projected(id: string, viewerId: string): UserProfile | null {
  const { users, follows } = useUserStore.getState();
  const base = users[id];
  return base ? { ...base, isFollowing: follows[viewerId]?.ids[id] === true } : null;
}

/** Fetches a user only when not cached; concurrent calls share one request. */
export function ensureUser(id: string, viewerId: string): Promise<UserProfile | null> {
  const cached = projected(id, viewerId);
  if (cached) return Promise.resolve(cached);

  const key = `${viewerId}:${id}`;
  let request = userRequests.get(key);
  if (!request) {
    request = fetchUser(id, viewerId)
      .then((user) => {
        if (user) useUserStore.getState().actions.upsertUsers([user], viewerId);
        return user;
      })
      .finally(() => userRequests.delete(key));
    userRequests.set(key, request);
  }
  return request;
}

async function loadFollowGraph(viewerId: string): Promise<void> {
  const { actions } = useUserStore.getState();
  // A local toggle during the request makes the response stale: retry once with the newer version
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const version = (useUserStore.getState().follows[viewerId] ?? EMPTY_FOLLOWS).version;
    const ids = await fetchFollowedIds(viewerId);
    if (actions.setFollowedIds(viewerId, ids, version)) return;
  }
}

/** Loads the viewer's complete follow set once (needed to classify "following" pending posts). */
export function ensureFollowGraph(viewerId: string): Promise<void> {
  if (useUserStore.getState().follows[viewerId]?.loaded) return Promise.resolve();

  let request = followGraphRequests.get(viewerId);
  if (!request) {
    request = loadFollowGraph(viewerId).finally(() => followGraphRequests.delete(viewerId));
    followGraphRequests.set(viewerId, request);
  }
  return request;
}

/** Non-hook twin of `useFollowedIds` for event handlers. */
export function getFollowedIds(viewerId: string): { ids: ReadonlySet<string>; loaded: boolean } {
  const follows = useUserStore.getState().follows[viewerId] ?? EMPTY_FOLLOWS;
  return { ids: new Set(Object.keys(follows.ids)), loaded: follows.loaded };
}

// #region Selectors
/** User as seen by the current viewer; stable reference while its data & follow flag are unchanged. */
export const useUser = (id: string): UserProfile | undefined => {
  const viewerId = useViewerId();
  const [base, isFollowing] = useUserStore(
    useShallow((state) => [state.users[id], state.follows[viewerId]?.ids[id] === true] as const),
  );
  return useMemo(() => (base ? { ...base, isFollowing } : undefined), [base, isFollowing]);
};

/** Complete follow set of the current viewer (`loaded` false until `ensureFollowGraph` resolves). */
export const useFollowedIds = (): { ids: ReadonlySet<string>; loaded: boolean } => {
  const viewerId = useViewerId();
  // useShallow keeps the tuple reference while loaded flag & ids are unchanged -> memo stays stable
  const snapshot = useUserStore(
    useShallow((state) => {
      const follows = state.follows[viewerId] ?? EMPTY_FOLLOWS;
      return [follows.loaded, ...Object.keys(follows.ids)] as [boolean, ...string[]];
    }),
  );
  return useMemo(() => {
    const [loaded, ...ids] = snapshot;
    return { ids: new Set(ids), loaded };
  }, [snapshot]);
};

export const useUserActions = () => useUserStore((state) => state.actions);
// #endregion

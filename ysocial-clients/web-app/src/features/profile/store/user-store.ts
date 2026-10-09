import { useMemo } from "react";
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { useActorId } from "@/features/auth";
import {
  fetchFollowedIds,
  fetchUser,
  fetchUserByUsername,
  setFollow,
  upsertViewerUser,
} from "../services/user-service";
import type { ProfilePatch, UserProfile, UserProfileBase, ViewerFollows, ViewerUserInput } from "../types";

// Normalized client cache of users. Profile data is shared by every viewer; follow flags live in a
// per-viewer projection, so switching account never leaks `isFollowing`. Every screen reads the same
// entity via useUser(id), so follow changes are reflected everywhere in O(1).

interface UserStoreData {
  users: Record<string, UserProfileBase>;
  follows: Record<string, ViewerFollows>;
  /** lowercase username -> user id, maintained by `upsertUsers`. */
  idByUsername: Record<string, string>;
}

interface UserStoreActions {
  /** Shared data -> `users`; each `isFollowing` -> the viewer's projection (does not mark it loaded). */
  upsertUsers: (users: UserProfile[], actorId: string) => void;
  /**
   * Optimistic projection only: flips the actor's follow, target `followersCount` +-1 and the actor's own
   * `followingCount` +-1 when cached, in ONE update. Unknown id -> no-op. Reconciled by refetch (`commitFollow`).
   */
  toggleFollow: (actorId: string, id: string) => void;
  /** Merges edited profile fields into the shared user (header, hover cards & post authors follow). */
  patchUser: (id: string, patch: ProfilePatch) => void;
  /** Replaces the viewer's follow set; ignored (returns false) when a toggle happened since `sinceVersion`. */
  setFollowedIds: (actorId: string, ids: string[], sinceVersion: number) => boolean;
}

interface UserStoreState extends UserStoreData {
  actions: UserStoreActions;
}

const EMPTY_FOLLOWS: ViewerFollows = Object.freeze({ ids: {}, known: {}, loaded: false, version: 0 }) as ViewerFollows;

/** Viewer's follow flag for `id`; undefined while unknown (graph not loaded & never fetched for this viewer). */
function followState(follows: ViewerFollows | undefined, id: string): boolean | undefined {
  if (!follows || !(follows.loaded || follows.known[id])) return undefined;
  return follows.ids[id] === true;
}

const initialData = (): UserStoreData => ({ users: {}, follows: {}, idByUsername: {} });

export const useUserStore = create<UserStoreState>((set, get) => ({
  ...initialData(),
  actions: {
    upsertUsers: (users, actorId) =>
      set((state) => {
        const next = { ...state.users };
        const idByUsername = { ...state.idByUsername };
        const current = state.follows[actorId] ?? EMPTY_FOLLOWS;
        const ids = { ...current.ids };
        const known = { ...current.known };
        for (const { isFollowing, ...base } of users) {
          next[base.id] = base;
          idByUsername[base.username.toLowerCase()] = base.id;
          known[base.id] = true;
          if (isFollowing) ids[base.id] = true;
          else delete ids[base.id];
        }
        return { users: next, idByUsername, follows: { ...state.follows, [actorId]: { ...current, ids, known } } };
      }),

    toggleFollow: (actorId, id) =>
      set((state) => {
        const user = state.users[id];
        if (!user) return state;
        const current = state.follows[actorId] ?? EMPTY_FOLLOWS;
        const following = !current.ids[id];
        const ids = { ...current.ids };
        if (following) ids[id] = true;
        else delete ids[id];
        const delta = following ? 1 : -1;
        const actor = state.users[actorId];
        return {
          users: {
            ...state.users,
            [id]: { ...user, followersCount: Math.max(0, user.followersCount + delta) },
            ...(actor && actorId !== id ? { [actorId]: { ...actor, followingCount: Math.max(0, actor.followingCount + delta) } } : {}),
          },
          follows: {
            ...state.follows,
            [actorId]: { ...current, ids, known: { ...current.known, [id]: true }, version: current.version + 1 },
          },
        };
      }),

    patchUser: (id, patch) =>
      set((state) => {
        const user = state.users[id];
        return user ? { users: { ...state.users, [id]: { ...user, ...patch } } } : state;
      }),

    setFollowedIds: (actorId, ids, sinceVersion) => {
      const current = get().follows[actorId] ?? EMPTY_FOLLOWS;
      if (current.version !== sinceVersion) return false;
      const next: Record<string, true> = {};
      for (const id of ids) next[id] = true;
      set((state) => ({ follows: { ...state.follows, [actorId]: { ...current, ids: next, loaded: true } } }));
      return true;
    },
  },
}));

const userRequests = new Map<string, Promise<UserProfile | null>>();
const usernameRequests = new Map<string, Promise<UserProfile | null>>();
const viewerRequests = new Map<string, Promise<UserProfile | null>>();
const followGraphRequests = new Map<string, Promise<void>>();

/** Test-only: clear cached data & in-flight requests, keep actions. */
export const resetUserStore = () => {
  userRequests.clear();
  usernameRequests.clear();
  viewerRequests.clear();
  followGraphRequests.clear();
  useUserStore.setState(initialData());
};

/** Cached user as seen by `actorId`; null when missing or the viewer's follow state for it is unknown. */
function cachedFor(id: string, actorId: string): UserProfile | null {
  const { users, follows } = useUserStore.getState();
  const base = users[id];
  const isFollowing = followState(follows[actorId], id);
  return base && isFollowing !== undefined ? { ...base, isFollowing } : null;
}

/**
 * Fetches a user unless cached with a known follow state for this viewer (an account switch must not reuse
 * another viewer's projection); concurrent calls share one request.
 */
export function ensureUser(id: string, actorId: string): Promise<UserProfile | null> {
  const cached = cachedFor(id, actorId);
  if (cached) return Promise.resolve(cached);

  const key = `${actorId}:${id}`;
  let request = userRequests.get(key);
  if (!request) {
    request = fetchUser(id, actorId)
      .then((user) => {
        if (user) useUserStore.getState().actions.upsertUsers([user], actorId);
        return user;
      })
      .finally(() => userRequests.delete(key));
    userRequests.set(key, request);
  }
  return request;
}

/** Cache-first lookup by username (case-insensitive); concurrent calls share one request. Null when unknown. */
export function ensureUserByUsername(username: string, actorId: string): Promise<UserProfile | null> {
  const lower = username.toLowerCase();
  const id = useUserStore.getState().idByUsername[lower];
  const cached = id ? cachedFor(id, actorId) : null;
  if (cached) return Promise.resolve(cached);

  const key = `${actorId}:${lower}`;
  let request = usernameRequests.get(key);
  if (!request) {
    request = fetchUserByUsername(lower, actorId)
      .then((user) => {
        if (user) useUserStore.getState().actions.upsertUsers([user], actorId);
        return user;
      })
      .finally(() => usernameRequests.delete(key));
    usernameRequests.set(key, request);
  }
  return request;
}

/**
 * Refetches users from the service (bypasses the cache); ids the service does not know are ignored.
 * `shouldApply` is re-checked after the fetch, right before the upsert, so a caller can drop a response
 * that went stale while the fetch was in flight (default: always apply).
 */
export async function refreshUsers(ids: string[], actorId: string, shouldApply: () => boolean = () => true): Promise<void> {
  const fetched = await Promise.all(ids.map((id) => fetchUser(id, actorId)));
  const users = fetched.filter((user): user is UserProfile => user !== null);
  if (users.length > 0 && shouldApply()) useUserStore.getState().actions.upsertUsers(users, actorId);
}

/**
 * Registers the signed-in mock account as a user. ONE shared promise per user id, so `ViewerSync` and
 * `ProfileContainer` never race on a hard refresh; a failed promise is evicted so a retry can run.
 */
export function ensureViewerUser(input: ViewerUserInput, actorId: string): Promise<UserProfile | null> {
  // Keyed by id AND username: the mock register reuses one id for every new account
  const requestKey = `${input.id}:${input.username}`;
  let request = viewerRequests.get(requestKey);
  if (!request) {
    request = upsertViewerUser(input, actorId).then((user) => {
      useUserStore.getState().actions.upsertUsers([user], actorId);
      return user;
    });
    request.catch(() => viewerRequests.delete(requestKey));
    viewerRequests.set(requestKey, request);
  }
  return request;
}

/**
 * Optimistic follow toggle + persistence + reconciliation. Resolves false (projection reverted) when the write
 * fails. The refetch from the follow graph applies only if no newer toggle happened meanwhile (last click wins).
 */
export async function commitFollow(actorId: string, id: string): Promise<boolean> {
  const { actions } = useUserStore.getState();
  actions.toggleFollow(actorId, id);
  const { version, ids } = useUserStore.getState().follows[actorId] ?? EMPTY_FOLLOWS;
  const following = ids[id] === true;

  try {
    await setFollow(id, following, actorId);
  } catch {
    // A newer toggle already superseded this one; only revert our own optimistic flip
    if (useUserStore.getState().follows[actorId]?.ids[id] === following) actions.toggleFollow(actorId, id);
    return false;
  }

  if (useUserStore.getState().follows[actorId]?.version === version) {
    // Re-checked again after the fetch: a toggle landing mid-flight must not be overwritten by a stale response
    await refreshUsers([id, actorId], actorId, () => useUserStore.getState().follows[actorId]?.version === version);
  }
  return true;
}

async function loadFollowGraph(actorId: string): Promise<void> {
  const { actions } = useUserStore.getState();
  // A local toggle during the request makes the response stale: retry once with the newer version
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const version = (useUserStore.getState().follows[actorId] ?? EMPTY_FOLLOWS).version;
    const ids = await fetchFollowedIds(actorId);
    if (actions.setFollowedIds(actorId, ids, version)) return;
  }
}

/** Loads the viewer's complete follow set once (needed to classify "following" pending posts). */
export function ensureFollowGraph(actorId: string): Promise<void> {
  if (useUserStore.getState().follows[actorId]?.loaded) return Promise.resolve();

  let request = followGraphRequests.get(actorId);
  if (!request) {
    request = loadFollowGraph(actorId).finally(() => followGraphRequests.delete(actorId));
    followGraphRequests.set(actorId, request);
  }
  return request;
}

/** Non-hook twin of `useFollowedIds` for event handlers. */
export function getFollowedIds(actorId: string): { ids: ReadonlySet<string>; loaded: boolean } {
  const follows = useUserStore.getState().follows[actorId] ?? EMPTY_FOLLOWS;
  return { ids: new Set(Object.keys(follows.ids)), loaded: follows.loaded };
}

// #region Selectors
/** User as seen by the current viewer; stable reference while its data & follow flag are unchanged. */
export const useUser = (id: string): UserProfile | undefined => {
  const actorId = useActorId();
  const [base, isFollowing] = useUserStore(
    useShallow((state) => [state.users[id], state.follows[actorId]?.ids[id] === true] as const),
  );
  return useMemo(() => (base ? { ...base, isFollowing } : undefined), [base, isFollowing]);
};

/** User by username (case-insensitive) as seen by the current viewer. */
export const useUserByUsername = (username: string): UserProfile | undefined => {
  const actorId = useActorId();
  const lower = username.toLowerCase();
  const [base, isFollowing] = useUserStore(
    useShallow((state) => {
      const id = state.idByUsername[lower];
      return [id ? state.users[id] : undefined, id ? state.follows[actorId]?.ids[id] === true : false] as const;
    }),
  );
  return useMemo(() => (base ? { ...base, isFollowing } : undefined), [base, isFollowing]);
};

/** Current viewer's follow flag for `id`; undefined while unknown (FollowButton must not guess). */
export const useFollowState = (id: string): boolean | undefined => {
  const actorId = useActorId();
  return useUserStore((state) => followState(state.follows[actorId], id));
};

/** Complete follow set of the current viewer (`loaded` false until `ensureFollowGraph` resolves). */
export const useFollowedIds = (): { ids: ReadonlySet<string>; loaded: boolean } => {
  const actorId = useActorId();
  // useShallow keeps the tuple reference while loaded flag & ids are unchanged -> memo stays stable
  const snapshot = useUserStore(
    useShallow((state) => {
      const follows = state.follows[actorId] ?? EMPTY_FOLLOWS;
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

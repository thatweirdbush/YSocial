import { useMemo } from "react";
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { useActorId } from "@/features/auth";
import {
  fetchFollowedIds,
  fetchUser,
  fetchUserByUsername,
  followUser,
  unfollowUser,
  upsertViewerUser,
} from "../services/user-service";
import type { FollowStatus, ProfilePatch, UserProfile, UserProfileBase, ViewerFollows, ViewerUserInput } from "../types";
import { toUserBase, withViewerDefaults } from "../utils/user-projection";
import { beginOp, isCurrentOp } from "./op-ledger";
import { getViewerRelations, relationFlagsOf, useRelationFlags } from "./relation-state";

// Normalized client cache of users. Profile data is shared by every viewer; follow flags live in a
// per-viewer projection, so switching account never leaks the follow status. Every screen reads the same
// entity via useUser(id), so follow changes are reflected everywhere in O(1).

interface UserStoreData {
  users: Record<string, UserProfileBase>;
  follows: Record<string, ViewerFollows>;
  /** lowercase username -> user id, maintained by `upsertUsers`. */
  idByUsername: Record<string, string>;
}

interface UserStoreActions {
  /** Shared data -> `users`; each `followStatus` -> the viewer's projection (does not mark it loaded). */
  upsertUsers: (users: UserProfile[], actorId: string) => void;
  /**
   * Optimistic projection only: sets the actor's status for `id` explicitly (never toggles). Target
   * `followersCount` & the actor's own `followingCount` change by 1 ONLY when the status crosses `accepted`, in ONE
   * update. Unknown id -> no-op. Reconciled by refetch (`commitFollow`).
   */
  setFollowStatus: (actorId: string, id: string, next: FollowStatus) => void;
  /** Drops the viewer's follow projection (status, known, loaded) and bumps its version (spec D25). */
  clearViewerFollows: (actorId: string) => void;
  /** Merges edited profile fields into the shared user (header, hover cards & post authors follow). */
  patchUser: (id: string, patch: ProfilePatch) => void;
  /**
   * Replaces the viewer's ACCEPTED follow set (pending requests are kept); ignored (returns false) when a local
   * status change happened since `sinceVersion`.
   */
  setFollowedIds: (actorId: string, ids: string[], sinceVersion: number) => boolean;
}

interface UserStoreState extends UserStoreData {
  actions: UserStoreActions;
}

const EMPTY_FOLLOWS: ViewerFollows = Object.freeze({ status: {}, known: {}, loaded: false, version: 0 }) as ViewerFollows;

/** Viewer's follow status for `id`; undefined while unknown (graph not loaded & never fetched for this viewer). */
function followState(follows: ViewerFollows | undefined, id: string): FollowStatus | undefined {
  if (!follows || !(follows.loaded || follows.known[id])) return undefined;
  return follows.status[id] ?? "none";
}

const acceptedIds = (follows: ViewerFollows): string[] => Object.keys(follows.status).filter((id) => follows.status[id] === "accepted");

const initialData = (): UserStoreData => ({ users: {}, follows: {}, idByUsername: {} });

export const useUserStore = create<UserStoreState>((set, get) => ({
  ...initialData(),
  actions: {
    upsertUsers: (users, actorId) =>
      set((state) => {
        const next = { ...state.users };
        const idByUsername = { ...state.idByUsername };
        const current = state.follows[actorId] ?? EMPTY_FOLLOWS;
        const status = { ...current.status };
        const known = { ...current.known };
        for (const user of users) {
          const base = toUserBase(user);
          next[base.id] = base;
          idByUsername[base.username.toLowerCase()] = base.id;
          known[base.id] = true;
          if (user.followStatus === "none") delete status[base.id];
          else status[base.id] = user.followStatus;
        }
        return { users: next, idByUsername, follows: { ...state.follows, [actorId]: { ...current, status, known } } };
      }),

    setFollowStatus: (actorId, id, next) =>
      set((state) => {
        const user = state.users[id];
        if (!user) return state;
        const current = state.follows[actorId] ?? EMPTY_FOLLOWS;
        const previous = current.status[id] ?? "none";
        const status = { ...current.status };
        if (next === "none") delete status[id];
        else status[id] = next;
        // Counts move only when the status crosses the accepted boundary
        const delta = Number(next === "accepted") - Number(previous === "accepted");
        const actor = state.users[actorId];
        const users =
          delta === 0
            ? state.users
            : {
                ...state.users,
                [id]: { ...user, followersCount: Math.max(0, user.followersCount + delta) },
                ...(actor && actorId !== id ? { [actorId]: { ...actor, followingCount: Math.max(0, actor.followingCount + delta) } } : {}),
              };
        return {
          users,
          follows: {
            ...state.follows,
            [actorId]: { ...current, status, known: { ...current.known, [id]: true }, version: current.version + 1 },
          },
        };
      }),

    clearViewerFollows: (actorId) =>
      set((state) => {
        const current = state.follows[actorId] ?? EMPTY_FOLLOWS;
        return { follows: { ...state.follows, [actorId]: { status: {}, known: {}, loaded: false, version: current.version + 1 } } };
      }),

    patchUser: (id, patch) =>
      set((state) => {
        const user = state.users[id];
        return user ? { users: { ...state.users, [id]: { ...user, ...patch } } } : state;
      }),

    setFollowedIds: (actorId, ids, sinceVersion) => {
      const current = get().follows[actorId] ?? EMPTY_FOLLOWS;
      if (current.version !== sinceVersion) return false;
      // The loaded set is accepted-only: pending requests are not in it and must survive
      const status: Record<string, "pending" | "accepted"> = {};
      for (const [id, value] of Object.entries(current.status)) if (value === "pending") status[id] = value;
      for (const id of ids) status[id] = "accepted";
      set((state) => ({ follows: { ...state.follows, [actorId]: { ...current, status, loaded: true } } }));
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
  const followStatus = followState(follows[actorId], id);
  return base && followStatus !== undefined ? withViewerDefaults(base, followStatus, relationFlagsOf(getViewerRelations(actorId), id)) : null;
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

/** Non-hook twin of the `clearViewerFollows` action (spec D25: account switch). */
export const clearViewerFollows = (actorId: string): void => useUserStore.getState().actions.clearViewerFollows(actorId);

/**
 * Optimistic follow / unfollow + persistence + reconciliation (spec D5, D18). The optimistic status is explicit:
 * `unfollow` = none, `follow` = pending for a private target else accepted. Resolves false when the write fails,
 * rolling back ONLY if the field still holds this op's optimistic value. The service status and the refetch apply
 * only while no newer op started on the same target (last click wins; other targets never interfere).
 */
export async function commitFollow(actorId: string, id: string, next: "follow" | "unfollow"): Promise<boolean> {
  const { actions } = useUserStore.getState();
  const snapshot = useUserStore.getState();
  const previous = snapshot.follows[actorId]?.status[id] ?? "none";
  const optimistic: FollowStatus = next === "unfollow" ? "none" : snapshot.users[id]?.isPrivate ? "pending" : "accepted";
  const opVersion = beginOp(actorId, id);
  actions.setFollowStatus(actorId, id, optimistic);

  let result: FollowStatus = "none";
  try {
    if (next === "follow") result = await followUser(id, actorId);
    else await unfollowUser(id, actorId);
  } catch {
    if ((useUserStore.getState().follows[actorId]?.status[id] ?? "none") === optimistic) actions.setFollowStatus(actorId, id, previous);
    return false;
  }

  if (isCurrentOp(actorId, id, opVersion)) {
    if (result !== optimistic) actions.setFollowStatus(actorId, id, result);
    // Re-checked after the fetch: a newer op landing mid-flight must not be overwritten by a stale response
    await refreshUsers([id, actorId], actorId, () => isCurrentOp(actorId, id, opVersion));
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
  return { ids: new Set(acceptedIds(follows)), loaded: follows.loaded };
}

// #region Selectors
/** User as seen by the current viewer; stable reference while its data & follow flag are unchanged. */
export const useUser = (id: string): UserProfile | undefined => {
  const actorId = useActorId();
  const [base, followStatus] = useUserStore(
    useShallow((state) => [state.users[id], state.follows[actorId]?.status[id] ?? "none"] as const),
  );
  const flags = useRelationFlags(actorId, id);
  return useMemo(() => (base ? withViewerDefaults(base, followStatus, flags) : undefined), [base, followStatus, flags]);
};

/** User by username (case-insensitive) as seen by the current viewer. */
export const useUserByUsername = (username: string): UserProfile | undefined => {
  const actorId = useActorId();
  const lower = username.toLowerCase();
  const id = useUserStore((state) => state.idByUsername[lower]);
  const [base, followStatus] = useUserStore(
    useShallow((state) => [id ? state.users[id] : undefined, id ? (state.follows[actorId]?.status[id] ?? "none") : "none"] as const),
  );
  const flags = useRelationFlags(actorId, id ?? "");
  return useMemo(() => (base ? withViewerDefaults(base, followStatus, flags) : undefined), [base, followStatus, flags]);
};

/** Current viewer's follow status for `id`; undefined while unknown (FollowButton must not guess). */
export const useFollowState = (id: string): FollowStatus | undefined => {
  const actorId = useActorId();
  return useUserStore((state) => followState(state.follows[actorId], id));
};

/** Complete ACCEPTED follow set of the current viewer (`loaded` false until `ensureFollowGraph` resolves). */
export const useFollowedIds = (): { ids: ReadonlySet<string>; loaded: boolean } => {
  const actorId = useActorId();
  // useShallow keeps the tuple reference while loaded flag & ids are unchanged -> memo stays stable
  const snapshot = useUserStore(
    useShallow((state) => {
      const follows = state.follows[actorId] ?? EMPTY_FOLLOWS;
      return [follows.loaded, ...acceptedIds(follows)] as [boolean, ...string[]];
    }),
  );
  return useMemo(() => {
    const [loaded, ...ids] = snapshot;
    return { ids: new Set(ids), loaded };
  }, [snapshot]);
};

export const useUserActions = () => useUserStore((state) => state.actions);
// #endregion

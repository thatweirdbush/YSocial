import { useMemo } from "react";
import { GUEST_ACTOR_ID, useActorId } from "@/features/auth";
import { getPostActions } from "@/features/posts";
import type { ExcludedAuthors } from "@/features/posts/types";
import {
  fetchFollowRequestCount,
  fetchRelationSets,
  respondFollowRequest,
  setBlocked,
  setCloseFriend,
  setMuted,
  setPrivateAccount,
} from "../services/relation-service";
import type { FollowStatus, RelationSets, RequestDecision } from "../types";
import { beginOp, getMutationSeq, getViewerGeneration, isCurrentOp } from "./op-ledger";
import {
  getViewerRelations,
  resetRelationState,
  useRelationFlags,
  useRelationStore,
  type ViewerRelations,
} from "./relation-state";
import { clearViewerFollows, refreshUsers, useFollowState, useUserStore } from "./user-store";

// Orchestration of the relation controls (spec D18, D20, D24, D25): loads the viewer's relation sets, runs the
// optimistic commits across `relation-state`, `user-store` & `post-store`, reconciles ONLY while no newer op
// started on the same target, and rolls back field by field (a field reverts only while it still holds this op's
// optimistic value, independent of versions). Guests resolve false without touching the service.

export { useRelationStore };

const isGuest = (actorId: string) => actorId === GUEST_ACTOR_ID;

const actions = () => useRelationStore.getState().actions;

// #region Loading
const loads = new Map<string, Promise<void>>();
const loadTokens = new Map<string, number>();

/** Muted ids -> `muted`; blocked & blocked-by ids -> `blocked` (D20: 1 source for cards, buffer & pill). */
function toExcludedAuthors(sets: RelationSets): ExcludedAuthors {
  const excluded: ExcludedAuthors = {};
  for (const id of [...sets.blocked, ...sets.blockedBy]) excluded[id] = { ...excluded[id], blocked: true };
  for (const id of sets.muted) excluded[id] = { ...excluded[id], muted: true };
  return excluded;
}

async function loadRelationSets(actorId: string, token: number): Promise<void> {
  // A response of another viewer generation (A -> B -> A) never reaches the post store (D25)
  const generation = getViewerGeneration();
  // A mutation started while the request was in flight makes the response stale: read again once (D18 c)
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const sequence = getMutationSeq(actorId);
    const sets = await fetchRelationSets(actorId);
    if (loadTokens.get(actorId) !== token) return;
    if (getMutationSeq(actorId) !== sequence) continue;

    actions().applySets(actorId, sets);
    if (getViewerGeneration() === generation) getPostActions().setExcludedAuthors(toExcludedAuthors(sets));
    return;
  }
}

/**
 * Loads the viewer's complete relation sets once (deduped per viewer). `force` reloads and supersedes any load in
 * flight. Guests get empty sets without a service call.
 */
export function ensureRelationSets(actorId: string, { force = false }: { force?: boolean } = {}): Promise<void> {
  if (isGuest(actorId)) {
    actions().applySets(actorId, { blocked: [], blockedBy: [], muted: [], closeFriends: [], isPrivate: false, requestCount: 0 });
    return Promise.resolve();
  }
  if (!force && getViewerRelations(actorId)?.loaded) return Promise.resolve();

  const existing = loads.get(actorId);
  if (existing && !force) return existing;

  const token = (loadTokens.get(actorId) ?? 0) + 1;
  loadTokens.set(actorId, token);
  const request: Promise<void> = loadRelationSets(actorId, token).finally(() => {
    if (loads.get(actorId) === request) loads.delete(actorId);
  });
  loads.set(actorId, request);
  return request;
}

/**
 * Account switch (spec D25): while another account was active its mutations (respond, bulk accept, block cleanup)
 * may have changed this viewer's edges, so the cached follow projection & relation slot are dropped.
 */
export function invalidateViewerProjection(actorId: string): void {
  clearViewerFollows(actorId);
  actions().clearViewer(actorId);
}

/**
 * Refetches the pending request count; dropped when a mutation started meanwhile (its own refetch wins). An
 * `external` refetch (not caused by the request list itself) that changes the count makes the list reload.
 */
export async function refreshRequestCount(actorId: string, { external = false }: { external?: boolean } = {}): Promise<void> {
  if (isGuest(actorId)) return;
  const sequence = getMutationSeq(actorId);
  const count = await fetchFollowRequestCount(actorId);
  if (getMutationSeq(actorId) !== sequence) return;
  const previous = getViewerRelations(actorId)?.requestCount;
  actions().setRequestCount(actorId, count);
  if (external && previous !== count) actions().bumpRequestsVersion(actorId);
}

/** Test-only: forget every viewer slot and the in-flight loads. */
export function resetRelationStore(): void {
  resetRelationState();
  loads.clear();
  loadTokens.clear();
}
// #endregion

// #region Commits
const statusOf = (actorId: string, id: string): FollowStatus => useUserStore.getState().follows[actorId]?.status[id] ?? "none";

/**
 * Block / unblock `id`. Blocking sets an explicit `none` in both directions of the cached follow projection and
 * excludes the author everywhere; unblocking lifts the exclusion only if the author did not block the viewer too.
 */
export async function commitBlock(actorId: string, id: string, on: boolean): Promise<boolean> {
  if (isGuest(actorId)) return false;

  const userActions = useUserStore.getState().actions;
  const postActions = getPostActions();
  const isBlockedBy = () => getViewerRelations(actorId)?.blockedBy[id] === true;
  const holdsValue = () => (getViewerRelations(actorId)?.blocked[id] === true) === on;
  const before = {
    blocked: getViewerRelations(actorId)?.blocked[id] === true,
    mine: statusOf(actorId, id),
    theirs: statusOf(id, actorId),
  };

  const opVersion = beginOp(actorId, id);
  actions().setFlag(actorId, "blocked", id, on);
  if (on) {
    userActions.setFollowStatus(actorId, id, "none");
    userActions.setFollowStatus(id, actorId, "none");
    postActions.excludeAuthor(id, "blocked");
  } else if (!isBlockedBy()) {
    postActions.includeAuthor(id, "blocked");
  }

  try {
    await setBlocked(id, on, actorId);
  } catch {
    if (holdsValue()) {
      actions().setFlag(actorId, "blocked", id, before.blocked);
      if (on) {
        if (statusOf(actorId, id) === "none" && before.mine !== "none") userActions.setFollowStatus(actorId, id, before.mine);
        if (statusOf(id, actorId) === "none" && before.theirs !== "none") userActions.setFollowStatus(id, actorId, before.theirs);
        if (!before.blocked && !isBlockedBy()) postActions.includeAuthor(id, "blocked");
      } else if (before.blocked) {
        postActions.excludeAuthor(id, "blocked");
      }
    }
    return false;
  }

  if (isCurrentOp(actorId, id, opVersion)) {
    const current = () => isCurrentOp(actorId, id, opVersion);
    await Promise.all([refreshUsers([id, actorId], actorId, current), refreshRequestCount(actorId, { external: true })]);
  }
  return true;
}

/** Mute / unmute `id`: hides the author from the home feeds & the new-post stream only. */
export async function commitMute(actorId: string, id: string, on: boolean): Promise<boolean> {
  if (isGuest(actorId)) return false;

  const postActions = getPostActions();
  const holdsValue = () => (getViewerRelations(actorId)?.muted[id] === true) === on;
  const before = getViewerRelations(actorId)?.muted[id] === true;

  beginOp(actorId, id);
  actions().setFlag(actorId, "muted", id, on);
  if (on) postActions.excludeAuthor(id, "muted");
  else postActions.includeAuthor(id, "muted");

  try {
    await setMuted(id, on, actorId);
  } catch {
    if (holdsValue()) {
      actions().setFlag(actorId, "muted", id, before);
      if (on && !before) postActions.includeAuthor(id, "muted");
      else if (!on && before) postActions.excludeAuthor(id, "muted");
    }
    return false;
  }
  return true;
}

/** Add / remove `id` from the close friends (the service rejects a target that is not an accepted follow). */
export async function commitCloseFriend(actorId: string, id: string, on: boolean): Promise<boolean> {
  if (isGuest(actorId)) return false;

  const holdsValue = () => (getViewerRelations(actorId)?.closeFriends[id] === true) === on;
  const before = getViewerRelations(actorId)?.closeFriends[id] === true;

  beginOp(actorId, id);
  actions().setFlag(actorId, "closeFriends", id, on);

  try {
    await setCloseFriend(id, on, actorId);
  } catch {
    if (holdsValue()) actions().setFlag(actorId, "closeFriends", id, before);
    return false;
  }
  return true;
}

/** Private -> public auto-accepts every pending request (D15); refetches the request count & the own user. */
export async function commitPrivacy(actorId: string, on: boolean): Promise<{ ok: boolean; acceptedCount: number }> {
  if (isGuest(actorId)) return { ok: false, acceptedCount: 0 };

  const before: Pick<ViewerRelations, "isPrivate" | "requestCount"> = {
    isPrivate: getViewerRelations(actorId)?.isPrivate,
    requestCount: getViewerRelations(actorId)?.requestCount,
  };
  const opVersion = beginOp(actorId, "self");
  actions().setPrivate(actorId, on);
  if (!on) {
    actions().setRequestCount(actorId, 0);
    if (before.requestCount !== 0) actions().bumpRequestsVersion(actorId);
  }

  let acceptedCount: number;
  try {
    ({ acceptedCount } = await setPrivateAccount(on, actorId));
  } catch {
    const slot = getViewerRelations(actorId);
    if (slot?.isPrivate === on && before.isPrivate !== undefined) actions().setPrivate(actorId, before.isPrivate);
    if (!on && slot?.requestCount === 0 && before.requestCount !== undefined) actions().setRequestCount(actorId, before.requestCount);
    return { ok: false, acceptedCount: 0 };
  }

  if (isCurrentOp(actorId, "self", opVersion)) {
    await Promise.all([refreshUsers([actorId], actorId, () => isCurrentOp(actorId, "self", opVersion)), refreshRequestCount(actorId, { external: true })]);
  }
  return { ok: true, acceptedCount };
}

/** Accept / decline the follow request of `requesterId`. */
export async function commitRespondRequest(actorId: string, requesterId: string, decision: RequestDecision): Promise<boolean> {
  if (isGuest(actorId)) return false;

  const before = getViewerRelations(actorId)?.requestCount;
  const optimistic = before === undefined ? undefined : Math.max(0, before - 1);
  const opVersion = beginOp(actorId, requesterId);
  if (optimistic !== undefined) actions().setRequestCount(actorId, optimistic);

  try {
    await respondFollowRequest(requesterId, decision, actorId);
  } catch {
    if (before !== undefined && getViewerRelations(actorId)?.requestCount === optimistic) actions().setRequestCount(actorId, before);
    return false;
  }

  if (isCurrentOp(actorId, requesterId, opVersion)) {
    const current = () => isCurrentOp(actorId, requesterId, opVersion);
    await Promise.all([refreshRequestCount(actorId), refreshUsers([actorId, requesterId], actorId, current)]);
  }
  return true;
}
// #endregion

// #region Selectors
const useSlot = <T,>(select: (slot: ViewerRelations | undefined) => T): T => {
  const actorId = useActorId();
  return useRelationStore((state) => select(state.byViewer[actorId]));
};

/** The viewer blocked `id`. */
export const useIsBlocked = (id: string): boolean => useSlot((slot) => slot?.blocked[id] === true);
/** `id` blocked the viewer. */
export const useIsBlockedBy = (id: string): boolean => useSlot((slot) => slot?.blockedBy[id] === true);
export const useIsMuted = (id: string): boolean => useSlot((slot) => slot?.muted[id] === true);
export const useIsPrivateAccount = (): boolean => useSlot((slot) => slot?.isPrivate === true);
export const useFollowRequestCount = (): number => useSlot((slot) => slot?.requestCount ?? 0);
/** Changes when the requests changed from outside the request list: the list reloads its first page. */
export const useFollowRequestsVersion = (): number => useSlot((slot) => slot?.requestsVersion ?? 0);
/** Effective close friends: flagged AND an accepted follow (a dormant flag never counts, spec D7). */
export const useCloseFriendCount = (): number => {
  const actorId = useActorId();
  const flags = useRelationStore((state) => state.byViewer[actorId]?.closeFriends);
  const status = useUserStore((state) => state.follows[actorId]?.status);
  return useMemo(() => Object.keys(flags ?? {}).filter((id) => status?.[id] === "accepted").length, [flags, status]);
};
/** False until the viewer's complete sets loaded: UI that depends on block state must wait for it. */
export const useRelationsLoaded = (): boolean => useSlot((slot) => slot?.loaded === true);

/** Close friend flag AND an accepted follow (a dormant flag never counts, spec D7). */
export const useViewerMarkedCloseFriend = (id: string): boolean => {
  const actorId = useActorId();
  const flags = useRelationFlags(actorId, id);
  const status = useFollowState(id);
  return flags.markedCloseFriend && status === "accepted";
};
// #endregion

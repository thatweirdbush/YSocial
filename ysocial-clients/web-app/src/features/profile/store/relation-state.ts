import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type { RelationFlags, RelationSets } from "../types";

// Viewer-scoped optimistic projection of the relation sets (blocked, blocked-by, muted, close friends, privacy,
// request count). Pure state with NO import of `user-store` / `post-store`, so `user-store` can read the flags
// of a user without an import cycle; orchestration (loading, commits, rollbacks) lives in `relation-store`.
// The mock graphs stay the only authority (spec D17): this is a cache keyed by viewer.

export interface ViewerRelations {
  blocked: Record<string, true>;
  /** Users who blocked the viewer. */
  blockedBy: Record<string, true>;
  muted: Record<string, true>;
  /** Close friend flags the viewer set (effective only while the follow is accepted). */
  closeFriends: Record<string, true>;
  /** Undefined until the sets loaded. */
  isPrivate?: boolean;
  requestCount?: number;
  /** True once the complete sets were loaded from the service. */
  loaded: boolean;
}

export type RelationFlagField = "blocked" | "blockedBy" | "muted" | "closeFriends";

interface RelationStoreActions {
  /** Replaces the viewer's slot with a complete load. */
  applySets: (actorId: string, sets: RelationSets) => void;
  setFlag: (actorId: string, field: RelationFlagField, id: string, on: boolean) => void;
  setPrivate: (actorId: string, value: boolean) => void;
  setRequestCount: (actorId: string, count: number) => void;
  /** Drops the viewer's slot (account switch, spec D25). */
  clearViewer: (actorId: string) => void;
}

interface RelationStoreState {
  byViewer: Record<string, ViewerRelations>;
  actions: RelationStoreActions;
}

const emptySlot = (): ViewerRelations => ({ blocked: {}, blockedBy: {}, muted: {}, closeFriends: {}, loaded: false });

const toSet = (ids: readonly string[]): Record<string, true> => Object.fromEntries(ids.map((id) => [id, true as const]));

export const useRelationStore = create<RelationStoreState>((set) => ({
  byViewer: {},
  actions: {
    applySets: (actorId, sets) =>
      set((state) => ({
        byViewer: {
          ...state.byViewer,
          [actorId]: {
            blocked: toSet(sets.blocked),
            blockedBy: toSet(sets.blockedBy),
            muted: toSet(sets.muted),
            closeFriends: toSet(sets.closeFriends),
            isPrivate: sets.isPrivate,
            requestCount: sets.requestCount,
            loaded: true,
          },
        },
      })),

    setFlag: (actorId, field, id, on) =>
      set((state) => {
        const slot = state.byViewer[actorId] ?? emptySlot();
        if ((slot[field][id] === true) === on) return state;
        const next = { ...slot[field] };
        if (on) next[id] = true;
        else delete next[id];
        return { byViewer: { ...state.byViewer, [actorId]: { ...slot, [field]: next } } };
      }),

    setPrivate: (actorId, value) =>
      set((state) => {
        const slot = state.byViewer[actorId] ?? emptySlot();
        return slot.isPrivate === value ? state : { byViewer: { ...state.byViewer, [actorId]: { ...slot, isPrivate: value } } };
      }),

    setRequestCount: (actorId, count) =>
      set((state) => {
        const slot = state.byViewer[actorId] ?? emptySlot();
        return slot.requestCount === count ? state : { byViewer: { ...state.byViewer, [actorId]: { ...slot, requestCount: count } } };
      }),

    clearViewer: (actorId) =>
      set((state) => {
        if (!(actorId in state.byViewer)) return state;
        const byViewer = { ...state.byViewer };
        delete byViewer[actorId];
        return { byViewer };
      }),
  },
}));

/** Test-only: forget every viewer slot. */
export const resetRelationState = () => useRelationStore.setState({ byViewer: {} });

/** Non-hook read of a viewer's slot. */
export const getViewerRelations = (actorId: string): ViewerRelations | undefined => useRelationStore.getState().byViewer[actorId];

export const NO_RELATION_FLAGS: RelationFlags = Object.freeze({ isMuted: false, isBlocked: false, isBlockedBy: false, markedCloseFriend: false });

/** The viewer's flags for `id`; unknown slot / id -> all false. */
export function relationFlagsOf(slot: ViewerRelations | undefined, id: string): RelationFlags {
  if (!slot) return NO_RELATION_FLAGS;
  return {
    isMuted: slot.muted[id] === true,
    isBlocked: slot.blocked[id] === true,
    isBlockedBy: slot.blockedBy[id] === true,
    markedCloseFriend: slot.closeFriends[id] === true,
  };
}

/** Stable (shallow-compared) flags of `id` for `actorId`. */
export const useRelationFlags = (actorId: string, id: string): RelationFlags =>
  useRelationStore(useShallow((state) => relationFlagsOf(state.byViewer[actorId], id)));

"use client";

import { useEffect, useRef } from "react";
import { useActorId, useAuthHydrated, useAuthStore, useViewerId } from "@/features/auth";
import { getPostActions } from "@/features/posts";
import { bumpViewerGeneration } from "../store/op-ledger";
import { ensureRelationSets, invalidateViewerProjection } from "../store/relation-store";
import { ensureFollowGraph, ensureViewerUser } from "../store/user-store";
import { toViewerUserInput } from "../utils/viewer-user";

/**
 * Registers the signed-in mock account in the mock user DB once per session id, only after auth hydration, and
 * keeps every viewer-dependent cache in step with the active account (spec D25). On an account switch: bumps the
 * viewer generation, resets the viewer-dependent feed state, drops the new viewer's follow projection (another
 * account may have changed its edges meanwhile) and reloads its relation sets. Renders nothing; mounted by `Providers`.
 */
export function ViewerSync(): null {
  const hydrated = useAuthHydrated();
  const viewerId = useViewerId();
  const actorId = useActorId();
  const previousActorId = useRef(actorId);

  useEffect(() => {
    if (!hydrated) {
      previousActorId.current = actorId;
      return;
    }
    if (previousActorId.current !== actorId) {
      previousActorId.current = actorId;
      bumpViewerGeneration();
      getPostActions().resetViewerFeeds();
      invalidateViewerProjection(actorId);
      ensureFollowGraph(actorId).catch(() => undefined);
    }
    ensureRelationSets(actorId, { force: true }).catch(() => undefined);
  }, [hydrated, actorId]);

  useEffect(() => {
    if (!hydrated || !viewerId) return;
    const user = useAuthStore.getState().user;
    if (!user) return;
    ensureViewerUser(toViewerUserInput(user), actorId).catch(() => undefined);
  }, [hydrated, viewerId, actorId]);

  return null;
}

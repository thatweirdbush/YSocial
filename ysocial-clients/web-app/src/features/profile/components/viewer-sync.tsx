"use client";

import { useEffect } from "react";
import { useActorId, useAuthHydrated, useAuthStore, useViewerId } from "@/features/auth";
import { ensureViewerUser } from "../store/user-store";
import { toViewerUserInput } from "../utils/viewer-user";

/**
 * Registers the signed-in mock account in the mock user DB once per session id, only after auth hydration.
 * Renders nothing; mounted by `Providers`.
 */
export function ViewerSync(): null {
  const hydrated = useAuthHydrated();
  const viewerId = useViewerId();
  const actorId = useActorId();

  useEffect(() => {
    if (!hydrated || !viewerId) return;
    const user = useAuthStore.getState().user;
    if (!user) return;
    ensureViewerUser(toViewerUserInput(user), actorId).catch(() => undefined);
  }, [hydrated, viewerId, actorId]);

  return null;
}

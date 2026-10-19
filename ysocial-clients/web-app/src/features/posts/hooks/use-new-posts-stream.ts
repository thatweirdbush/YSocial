import { useEffect } from "react";
import { useActorId } from "@/features/auth";
import { hasCapability } from "@/lib/capabilities";
import { ensureUser } from "@/features/profile";
import { subscribeToNewPosts } from "../services/post-service";
import { usePostActions } from "../store/post-store";

/**
 * Buffers pushed posts while the feed is mounted and the browser tab is visible (no work in background tabs).
 * Each author is loaded into `user-store` so the "following" pill can classify the post.
 */
export function useNewPostsStream(): void {
  const actorId = useActorId();
  const { bufferIncoming } = usePostActions();

  useEffect(() => {
    // Simulated push stream: real posts have no stream yet (a mock post id would reach real routes)
    if (!hasCapability("newPostsPill")) return;
    let unsubscribe: (() => void) | undefined;

    const sync = () => {
      if (document.visibilityState === "visible") {
        unsubscribe ??= subscribeToNewPosts((post) => {
          bufferIncoming(post);
          ensureUser(post.user.id, actorId).catch(() => undefined);
        });
      } else {
        unsubscribe?.();
        unsubscribe = undefined;
      }
    };

    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      unsubscribe?.();
    };
  }, [actorId, bufferIncoming]);
}

import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTranslation } from "@/hooks/use-translation";
import { deletePost, ForbiddenError, setHideLikeCount, setPostPinned, updatePostContent } from "../services/post-service";
import { useOwnerOp, usePostActions, usePostStore } from "../store/post-store";
import type { OwnerOp, PostItem } from "../types";
import { toPostRef } from "../utils/post-ref";
import { useCurrentAuthor } from "./use-current-author";

const POST_ROUTE = /^\/posts\/([^/?#]+)/;

/** True when the current `/posts/[x]` route shows `postId` or a reply under it (walks cached parents). */
export function isInViewedSubtree(pathname: string, postId: string, posts: Record<string, PostItem>): boolean {
  const match = POST_ROUTE.exec(pathname);
  let current: string | undefined = match ? decodeURIComponent(match[1]) : undefined;
  while (current) {
    if (current === postId) return true;
    current = posts[current]?.parentId;
  }
  return false;
}

export interface OwnerActions {
  pendingOp: OwnerOp | undefined;
  /** Resolves true when saved. */
  edit: (content: string) => Promise<boolean>;
  togglePin: () => Promise<void>;
  toggleHideLikeCount: () => Promise<void>;
  /** Resolves true when deleted. */
  remove: () => Promise<boolean>;
}

/**
 * Owner mutations for one post: lock -> optimistic store update -> mock service (enforces ownership)
 * -> service copy applied on success (beats a stale refetch that landed mid-op) | field-scoped rollback.
 * At most 1 op per post runs at a time.
 */
export function useOwnerActions(postId: string): OwnerActions {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const actorId = useCurrentAuthor().id;
  const pendingOp = useOwnerOp(postId);
  const actions = usePostActions();

  const current = () => usePostStore.getState().posts[postId];
  const fail = (error: unknown) =>
    toast.error(error instanceof ForbiddenError ? t("card.forbidden") : t("common.error"));

  /** Runs `body` under the post's owner-op lock; resolves `fallback` when the lock or post is missing. */
  const locked = async <T,>(op: OwnerOp, fallback: T, body: (post: PostItem) => Promise<T>): Promise<T> => {
    const post = current();
    if (!post || !actions.beginOwnerOp(postId, op)) return fallback;
    try {
      return await body(post);
    } finally {
      actions.endOwnerOp(postId);
    }
  };

  const edit = (content: string) =>
    locked("edit", false, async (post) => {
      const next = content.trim();
      actions.editPost(postId, next);
      try {
        const saved = await updatePostContent(toPostRef(post), next, actorId);
        actions.patchPostIf(postId, {}, { content: saved.content, isEdited: saved.isEdited });
        toast.success(t("card.editSuccess"));
        return true;
      } catch (error) {
        actions.patchPostIf(postId, { content: next }, { content: post.content, isEdited: post.isEdited });
        fail(error);
        return false;
      }
    });

  const togglePin = () =>
    locked("pin", undefined, async (post) => {
      const next = !post.isPinned;
      const unpinned = actions.setPinned(postId, next);
      try {
        const saved = await setPostPinned(postId, next, actorId);
        if (current()?.isPinned !== saved.isPinned) actions.setPinned(postId, saved.isPinned === true);
        toast.success(t(next ? "card.pinSuccess" : "card.unpinSuccess"));
      } catch (error) {
        // Undo only what is still in the optimistic state
        if (current()?.isPinned === next) actions.setPinned(postId, !next);
        const previous = unpinned ? usePostStore.getState().posts[unpinned] : undefined;
        if (previous && !previous.isPinned) actions.setPinned(previous.id, true);
        fail(error);
      }
    });

  const toggleHideLikeCount = () =>
    locked("hideLikeCount", undefined, async (post) => {
      const previous = post.hideLikeCount ?? false;
      const next = !previous;
      actions.setHideLikeCount(postId, next);
      try {
        const saved = await setHideLikeCount(postId, next, actorId);
        actions.patchPostIf(postId, {}, { hideLikeCount: saved.hideLikeCount });
      } catch (error) {
        actions.patchPostIf(postId, { hideLikeCount: next }, { hideLikeCount: previous });
        fail(error);
      }
    });

  const remove = () =>
    locked("delete", false, async (post) => {
      // Before removal: the cached parent chain is gone afterwards
      const viewed = isInViewedSubtree(pathname, postId, usePostStore.getState().posts);
      const snapshot = actions.removePost(postId);
      try {
        const { deletedIds } = await deletePost(toPostRef(post), actorId);
        actions.markDeleted(deletedIds);
        toast.success(t("card.deleteSuccess"));
        // The card may be unmounted by now (stale `pathname`): re-check the live route before leaving it
        if (viewed && window.location.pathname === pathname) router.replace("/");
        return true;
      } catch (error) {
        if (snapshot) actions.restorePosts(snapshot);
        fail(error);
        return false;
      }
    });

  return { pendingOp, edit, togglePin, toggleHideLikeCount, remove };
}

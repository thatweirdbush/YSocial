import type { PostItem } from "@/features/posts/types";
import { isEitherBlocked } from "./block-graph";
import { isPrivate } from "./privacy";
import { getEdge, getFollowStatus } from "./relation-graph";

// The single visibility contract every mock service reads before pagination (spec D8). `viewer` is the normalized
// actor (`asViewer`): `null` = guest. Block is NOT part of `canViewProfile`, so a blocked profile still resolves
// and can render its blocked state.

/** Mirrors `GUEST_ACTOR_ID` of `features/auth` (mocks cannot value-import features; a test pins equality). */
export const GUEST_ACTOR = "me";

export function asViewer(actorId: string): string | null {
  return actorId === GUEST_ACTOR ? null : actorId;
}

/** Search, suggestions & lists: hidden only across a block (private accounts stay discoverable to request follow). */
export function canDiscoverUser(viewer: string | null, userId: string): boolean {
  return !(viewer && isEitherBlocked(viewer, userId));
}

export function canViewProfile(viewer: string | null, userId: string): boolean {
  if (viewer === userId) return true;
  if (!isPrivate(userId)) return true;
  return viewer !== null && getFollowStatus(viewer, userId) === "accepted";
}

/** `authorId` marked `viewer` as a close friend and the follow is accepted (a dormant flag never counts). */
export function isMarkedBy(authorId: string, viewer: string): boolean {
  const edge = getEdge(authorId, viewer);
  return edge.status === "accepted" && edge.isCloseFriend;
}

export function canViewPost(viewer: string | null, post: Pick<PostItem, "user" | "visibility">): boolean {
  const authorId = post.user.id;
  if (!canDiscoverUser(viewer, authorId) || !canViewProfile(viewer, authorId)) return false;
  if (post.visibility !== "closeFriends") return true;
  return viewer !== null && (viewer === authorId || isMarkedBy(authorId, viewer));
}

/** Viewer muted the author (home feeds only). */
export function isMutedBy(viewer: string | null, authorId: string): boolean {
  return viewer !== null && getEdge(viewer, authorId).isMuted;
}

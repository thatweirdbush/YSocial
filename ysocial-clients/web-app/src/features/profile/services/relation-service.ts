import { CannotBlockYourselfError, ForbiddenError } from "@/lib/errors";
import { normalizeText, tokenize } from "@/lib/text";
import { getBlockedIds, getBlockerIds, setBlocked as writeBlocked } from "@/mocks/block-graph";
import { isPrivate, setPrivate } from "@/mocks/privacy";
import {
  acceptRequest,
  getCloseFriendFlagIds,
  getFollowedIds,
  getMutedIds,
  getRequestIds,
  removeFollow,
  setCloseFriend as writeCloseFriend,
  setMutedEdge,
} from "@/mocks/relation-graph";
import { asViewer } from "@/mocks/visibility";
import {
  RELATION_PAGE_SIZE,
  type FollowListPage,
  type RelationListQuery,
  type RelationSets,
  type RequestDecision,
  type StoredUser,
} from "../types";
import { getStoredUser, mockDelay, projectUser } from "./user-service";

// Mock data source for relation controls (block, mute, close friends, privacy, follow requests). Mirrors BE
// `UserRelation` / `UserBlock` / `PrivacySettings`; replace the bodies with real API calls when wired.
// Every write applies to the graph synchronously (before the latency) so graph order = call order (spec D18).

export { RELATION_PAGE_SIZE };

/** Writes are signed-in only (spec D9). */
function requireViewer(actorId: string): string {
  const viewer = asViewer(actorId);
  if (!viewer) throw new ForbiddenError("Sign in to manage relationships");
  return viewer;
}

/** Ids -> projected users matching `query`, in the given order, one page. */
function pageOfUsers(ids: readonly string[], { query = "", page = 1 }: RelationListQuery, actorId: string): FollowListPage {
  const tokens = tokenize(query.trim().replace(/^@/, ""));
  const matches = ids
    .flatMap((id) => {
      const user = getStoredUser(id);
      return user ? [user] : [];
    })
    .filter((user: StoredUser) => {
      if (tokens.length === 0) return true;
      const haystack = normalizeText(`${user.displayName} ${user.username}`);
      return tokens.every((token) => haystack.includes(token));
    });

  const start = (page - 1) * RELATION_PAGE_SIZE;
  const users = matches.slice(start, start + RELATION_PAGE_SIZE).map((user) => projectUser(user, actorId));
  return { users, nextPage: start + RELATION_PAGE_SIZE < matches.length ? page + 1 : undefined };
}

// #region Writes
export async function setBlocked(id: string, on: boolean, actorId: string): Promise<void> {
  const viewer = requireViewer(actorId);
  if (id === viewer) throw new CannotBlockYourselfError();

  writeBlocked(viewer, id, on);
  await mockDelay();
}

export async function setMuted(id: string, on: boolean, actorId: string): Promise<void> {
  const viewer = requireViewer(actorId);

  setMutedEdge(viewer, id, on);
  await mockDelay();
}

/** Throws unless the follow is accepted (BE rule). */
export async function setCloseFriend(id: string, on: boolean, actorId: string): Promise<void> {
  const viewer = requireViewer(actorId);

  writeCloseFriend(viewer, id, on);
  await mockDelay();
}

/** Going public auto-accepts every pending request; `acceptedCount` is how many were accepted. */
export async function setPrivateAccount(on: boolean, actorId: string): Promise<{ acceptedCount: number }> {
  const viewer = requireViewer(actorId);

  const acceptedCount = setPrivate(viewer, on);
  await mockDelay();
  return { acceptedCount };
}

/** Accept = requester becomes a follower; decline = request removed (no notification). */
export async function respondFollowRequest(requesterId: string, decision: RequestDecision, actorId: string): Promise<void> {
  const viewer = requireViewer(actorId);
  if (!getRequestIds(viewer).includes(requesterId)) throw new Error(`No pending request from ${requesterId}`);

  if (decision === "accept") acceptRequest(requesterId, viewer);
  else removeFollow(requesterId, viewer);
  await mockDelay();
}
// #endregion

// #region Reads
/** Requesters as profiles, newest first. Guest -> empty. */
export async function fetchFollowRequests(q: RelationListQuery, actorId: string): Promise<FollowListPage> {
  await mockDelay();

  const viewer = asViewer(actorId);
  return pageOfUsers(viewer ? getRequestIds(viewer) : [], q, actorId);
}

export async function fetchFollowRequestCount(actorId: string): Promise<number> {
  await mockDelay();

  const viewer = asViewer(actorId);
  return viewer ? getRequestIds(viewer).length : 0;
}

export async function fetchBlockedUsers(q: RelationListQuery, actorId: string): Promise<FollowListPage> {
  await mockDelay();

  const viewer = asViewer(actorId);
  return pageOfUsers(viewer ? getBlockedIds(viewer) : [], q, actorId);
}

export async function fetchMutedUsers(q: RelationListQuery, actorId: string): Promise<FollowListPage> {
  await mockDelay();

  const viewer = asViewer(actorId);
  return pageOfUsers(viewer ? getMutedIds(viewer) : [], q, actorId);
}

/** Accepted followees, with `viewerMarkedCloseFriend` projected. */
export async function fetchCloseFriendCandidates(q: RelationListQuery, actorId: string): Promise<FollowListPage> {
  await mockDelay();

  const viewer = asViewer(actorId);
  return pageOfUsers(viewer ? [...getFollowedIds(viewer)] : [], q, actorId);
}

export async function fetchRelationSets(actorId: string): Promise<RelationSets> {
  await mockDelay();

  const viewer = asViewer(actorId);
  if (!viewer) return { blocked: [], blockedBy: [], muted: [], closeFriends: [], isPrivate: false, requestCount: 0 };
  return {
    blocked: getBlockedIds(viewer),
    blockedBy: getBlockerIds(viewer),
    muted: getMutedIds(viewer),
    closeFriends: getCloseFriendFlagIds(viewer),
    isPrivate: isPrivate(viewer),
    requestCount: getRequestIds(viewer).length,
  };
}
// #endregion

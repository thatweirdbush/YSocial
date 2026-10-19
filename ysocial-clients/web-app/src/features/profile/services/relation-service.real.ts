import { apiClient } from "@/lib/api-client";
import { requireBackendId } from "@/lib/backend-id";
import { normalizeText, tokenize } from "@/lib/text";
import {
  RELATION_PAGE_SIZE,
  type FollowListKind,
  type FollowListPage,
  type FollowListPageDto,
  type FollowListQuery,
  type RelationListQuery,
  type RelationSets,
  type RelationSetsDto,
  type RequestDecision,
  type UserProfile,
} from "../types";
import { toFollowListPage } from "./user-mapper";

// Real BE adapter of `relation-service` + `fetchFollowList` (MAP §2.2-2.3). Same signatures as the mocks; the JWT
// identifies the viewer. 404 (blocked either way, D14) is NOT mapped here: it rejects so callers choose the state.

const FOLLOW_LIST_PAGE_SIZE = 20;
/** BE page size cap: used when a client-side filter must read every page. */
const SCAN_PAGE_SIZE = 50;
/** Safety cap against a BE that never reports the last page (1000 blocked users). */
const SCAN_MAX_PAGES = 20;

const listParams = (page: number, pageSize: number, query?: string) => ({
  page,
  pageSize,
  ...(query?.trim() ? { query: query.trim().replace(/^@/, "") } : {}),
});

async function readList(path: string, page: number, query?: string): Promise<FollowListPage> {
  return toFollowListPage(await apiClient.get<FollowListPageDto>(path, { params: listParams(page, RELATION_PAGE_SIZE, query) }));
}

// #region Reads
/** One page of followers / following. `locked: true` (private, not permitted) is a normal answer, not an error. */
export async function fetchFollowList(
  userId: string,
  kind: FollowListKind,
  { query, page = 1 }: FollowListQuery,
  _actorId: string,
): Promise<FollowListPage> {
  const result = await apiClient.get<FollowListPageDto>(`/api/users/${requireBackendId(userId)}/${kind}`, {
    params: listParams(page, FOLLOW_LIST_PAGE_SIZE, query),
  });
  return toFollowListPage(result);
}

export async function fetchFollowRequests({ query, page = 1 }: RelationListQuery, _actorId: string): Promise<FollowListPage> {
  return readList("/api/users/me/follow-requests", page, query);
}

export async function fetchFollowRequestCount(_actorId: string): Promise<number> {
  const result = await apiClient.get<{ count?: number | null }>("/api/users/me/follow-requests/count");
  return result?.count ?? 0;
}

/**
 * Own block list (the only place a blocked profile is visible, D14). The BE list has no `query`: a query reads every
 * page & filters here (diacritics-insensitive, like the BE relation search); without one it is a plain page.
 */
export async function fetchBlockedUsers({ query, page = 1 }: RelationListQuery, _actorId: string): Promise<FollowListPage> {
  const tokens = tokenize((query ?? "").trim().replace(/^@/, ""));
  if (tokens.length === 0) {
    const result = await apiClient.get<FollowListPageDto>("/api/users/me/blocks", { params: listParams(page, RELATION_PAGE_SIZE) });
    return markBlocked(toFollowListPage(result));
  }

  const matches: UserProfile[] = [];
  for (let current = 1; current <= SCAN_MAX_PAGES; current += 1) {
    const result = await apiClient.get<FollowListPageDto>("/api/users/me/blocks", { params: listParams(current, SCAN_PAGE_SIZE) });
    matches.push(...markBlocked(toFollowListPage(result)).users);
    if (!result.hasNextPage) break;
  }
  const filtered = matches.filter((user) => {
    const haystack = normalizeText(`${user.displayName} ${user.username}`);
    return tokens.every((token) => haystack.includes(token));
  });
  const start = (page - 1) * RELATION_PAGE_SIZE;
  return {
    users: filtered.slice(start, start + RELATION_PAGE_SIZE),
    nextPage: start + RELATION_PAGE_SIZE < filtered.length ? page + 1 : undefined,
  };
}

const markBlocked = (result: FollowListPage): FollowListPage => ({
  ...result,
  users: result.users.map((user) => ({ ...user, isBlocked: true })),
});

/** `blockedBy` is always empty: a user who blocked the viewer is invisible (404), never listed (D14). */
export async function fetchRelationSets(_actorId: string): Promise<RelationSets> {
  const dto = await apiClient.get<RelationSetsDto>("/api/users/me/relation-sets");
  return {
    blocked: dto.blocked ?? [],
    blockedBy: [],
    muted: dto.muted ?? [],
    closeFriends: dto.closeFriends ?? [],
    isPrivate: dto.isPrivate ?? false,
    requestCount: dto.requestCount ?? 0,
  };
}

/** Accepted followees of the viewer with the close friend flag projected from the relation sets. */
export async function fetchCloseFriendCandidates({ query, page = 1 }: RelationListQuery, actorId: string): Promise<FollowListPage> {
  const [followees, sets] = await Promise.all([
    apiClient.get<FollowListPageDto>(`/api/users/${requireBackendId(actorId)}/following`, {
      params: listParams(page, RELATION_PAGE_SIZE, query),
    }),
    fetchRelationSets(actorId),
  ]);
  const flagged = new Set(sets.closeFriends);
  const result = toFollowListPage(followees);
  return {
    ...result,
    users: result.users
      .filter((user) => user.followStatus !== "pending")
      .map((user) => ({ ...user, viewerMarkedCloseFriend: flagged.has(user.id) })),
  };
}
// #endregion

// #region Writes
/** Idempotent. 404 (missing target) & 400 `CannotBlockSelf` reject as `ApiError`. */
export async function setBlocked(id: string, on: boolean, _actorId: string): Promise<void> {
  const path = `/api/users/${requireBackendId(id)}/blocks`;
  if (on) await apiClient.post(path);
  else await apiClient.delete(path);
}

/** Only while the follow is accepted, else 400 `CloseFriendRequiresAcceptedFollow`. */
export async function setCloseFriend(id: string, on: boolean, _actorId: string): Promise<void> {
  await apiClient.patch(`/api/users/${requireBackendId(id)}/relations/close-friend`, { isCloseFriend: on });
}

/** Going public accepts every pending request; `acceptedCount` is the number of transitions. */
export async function setPrivateAccount(on: boolean, _actorId: string): Promise<{ acceptedCount: number }> {
  const result = await apiClient.put<{ acceptedCount?: number | null }>("/api/users/profiles/me/privacy", { isPrivate: on });
  return { acceptedCount: result?.acceptedCount ?? 0 };
}

/** 404 = no pending request (or inaccessible requester). */
export async function respondFollowRequest(requesterId: string, decision: RequestDecision, _actorId: string): Promise<void> {
  await apiClient.post(`/api/users/${requireBackendId(requesterId)}/relations/follow-request`, { decision });
}
// #endregion

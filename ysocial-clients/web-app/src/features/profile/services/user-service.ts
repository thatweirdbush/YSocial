import { isRealApi } from "@/lib/api-config";
import { ForbiddenError } from "@/lib/errors";
import { normalizeText, tokenize } from "@/lib/text";
import { isBlocked, isEitherBlocked } from "@/mocks/block-graph";
import { isPrivate } from "@/mocks/privacy";
import {
  getEdge,
  getFollowedIds,
  getFollowerCount,
  getFollowerIds,
  getFollowingCount,
  removeFollow,
  requestFollow,
} from "@/mocks/relation-graph";
import { isFanId } from "@/mocks/seed-fans";
import { asViewer, canDiscoverUser, canViewProfile } from "@/mocks/visibility";
import * as relationReal from "./relation-service.real";
import * as real from "./user-service.real";
import { HIDDEN_FOLLOWERS, HIDDEN_FOLLOWING, isSeedUserId, MOCK_USERS } from "../mocks/mock-users";
import {
  PROFILE_BIO_MAX,
  PROFILE_DISPLAY_NAME_MAX,
  PROFILE_DISPLAY_NAME_MIN,
  type FollowListKind,
  type FollowListPage,
  type FollowListQuery,
  type FollowStatus,
  type ProfilePatch,
  type StoredUser,
  type UserProfile,
  type ViewerUserInput,
} from "../types";

// Mock data source for users. Replace the bodies with real API calls when the backend is wired;
// callers (containers + user-store) stay unchanged. `actorId` stands in for the JWT subject.

const SEARCH_LIMIT = 50;

export const FOLLOW_LIST_PAGE_SIZE = 20;

let db = new Map<string, StoredUser>();

/** Test-only: restore the in-memory store from the seed dataset. */
export function __resetMockUsers(): void {
  db = new Map(MOCK_USERS.map((user) => [user.id, structuredClone(user)]));
}
__resetMockUsers();

/** Simulated network latency, shared with the relation service. */
export function mockDelay(): Promise<void> {
  const ms = 300 + Math.random() * 300;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Raw mock DB row (no viewer projection); used by the relation service to list users. */
export function getStoredUser(id: string): StoredUser | undefined {
  return db.get(id);
}

/** Copy with graph-derived counts (hidden baseline + relation count) and the actor's relation flags. */
export function projectUser(user: StoredUser, actorId: string): UserProfile {
  const viewer = asViewer(actorId);
  const edge = getEdge(actorId, user.id);
  return {
    ...structuredClone(user),
    followersCount: (HIDDEN_FOLLOWERS[user.id] ?? 0) + getFollowerCount(user.id),
    followingCount: (HIDDEN_FOLLOWING[user.id] ?? 0) + getFollowingCount(user.id),
    isPrivate: isPrivate(user.id),
    isFollowing: edge.status === "accepted",
    followStatus: edge.status,
    viewerMarkedCloseFriend: edge.status === "accepted" && edge.isCloseFriend,
    isMuted: edge.isMuted,
    isBlocked: viewer !== null && isBlocked(viewer, user.id),
    isBlockedBy: viewer !== null && isBlocked(user.id, viewer),
  };
}

const byFollowers = (a: UserProfile, b: UserProfile) => b.followersCount - a.followersCount;

/** Users matching every token over name, username & bio. Username-prefix hits first, then by followers. */
export async function searchUsers(query: string, actorId: string, limit = SEARCH_LIMIT): Promise<UserProfile[]> {
  await mockDelay();

  const tokens = tokenize(query.trim().replace(/^@/, ""));
  if (tokens.length === 0) return [];

  const viewer = asViewer(actorId);
  const startsWithFirst = (user: UserProfile) => normalizeText(user.username).startsWith(tokens[0]);
  return [...db.values()]
    .filter((user) => {
      const haystack = normalizeText(`${user.displayName} ${user.username} ${user.bio ?? ""}`);
      return canDiscoverUser(viewer, user.id) && tokens.every((token) => haystack.includes(token));
    })
    .map((user) => projectUser(user, actorId))
    .sort((a, b) => Number(startsWithFirst(b)) - Number(startsWithFirst(a)) || byFollowers(a, b))
    .slice(0, limit);
}

/** Users the actor does not follow (never the actor, fans or blocked users), most followed first. */
export async function fetchSuggestedUsers(limit: number, actorId: string): Promise<UserProfile[]> {
  await mockDelay();

  const followed = getFollowedIds(actorId);
  const viewer = asViewer(actorId);
  return [...db.values()]
    .filter((user) => user.id !== actorId && !isFanId(user.id) && !followed.has(user.id) && canDiscoverUser(viewer, user.id))
    .map((user) => projectUser(user, actorId))
    .sort(byFollowers)
    .slice(0, limit);
}

export async function fetchUser(id: string, actorId: string): Promise<UserProfile | null> {
  if (isRealApi("content")) return real.fetchUser(id, actorId);
  await mockDelay();

  const user = db.get(id);
  return user ? projectUser(user, actorId) : null;
}

/** Case-insensitive username lookup. */
export async function fetchUserByUsername(username: string, actorId: string): Promise<UserProfile | null> {
  if (isRealApi("content")) return real.fetchUserByUsername(username, actorId);
  await mockDelay();

  const wanted = username.toLowerCase();
  const user = [...db.values()].find((candidate) => candidate.username.toLowerCase() === wanted);
  return user ? projectUser(user, actorId) : null;
}

/** Complete set of authors the actor follows (accepted only). */
export async function fetchFollowedIds(actorId: string): Promise<string[]> {
  if (isRealApi("content")) return real.fetchFollowedIds(actorId);
  await mockDelay();
  return [...getFollowedIds(actorId)];
}

/**
 * Idempotent follow (mirrors BE `POST /relations/follow`): none -> pending (private target) / accepted (public);
 * pending & accepted stay unchanged. Applied before latency so refetches don't clobber optimistic UI. Guest or a
 * block either way -> `ForbiddenError`.
 */
export async function followUser(id: string, actorId: string): Promise<FollowStatus> {
  if (isRealApi("content")) return real.followUser(id, actorId);
  const viewer = asViewer(actorId);
  if (!viewer) throw new ForbiddenError("Sign in to follow");
  if (isEitherBlocked(viewer, id)) throw new ForbiddenError(`Cannot follow ${id}`);

  const status: FollowStatus = db.has(id) ? requestFollow(viewer, id, isPrivate(id)) : "none";
  await mockDelay();
  return status;
}

/** Idempotent unfollow / cancel request (mirrors BE `DELETE /relations/follow`): pending & accepted -> none. */
export async function unfollowUser(id: string, actorId: string): Promise<void> {
  if (isRealApi("content")) return real.unfollowUser(id, actorId);
  const viewer = asViewer(actorId);
  if (!viewer) throw new ForbiddenError("Sign in to unfollow");

  if (db.has(id)) removeFollow(viewer, id);
  await mockDelay();
}

/**
 * One page of a user's followers / following. Only users present in the mock DB are listed (the legacy guest
 * actor is counted by the graph but never listed), minus users the viewer cannot discover. Empty page when the
 * profile is blocked either way or locked (private & viewer not accepted). Seed & runtime users first (most
 * followed), then fans by id.
 */
export async function fetchFollowList(
  userId: string,
  kind: FollowListKind,
  { query = "", page = 1 }: FollowListQuery,
  actorId: string,
): Promise<FollowListPage> {
  if (isRealApi("graph")) return relationReal.fetchFollowList(userId, kind, { query, page }, actorId);
  await mockDelay();

  const viewer = asViewer(actorId);
  if (!canDiscoverUser(viewer, userId) || !canViewProfile(viewer, userId)) return { users: [] };

  const ids = kind === "followers" ? getFollowerIds(userId) : getFollowedIds(userId);
  const tokens = tokenize(query.trim().replace(/^@/, ""));

  const matches = [...ids]
    .flatMap((id) => {
      const user = db.get(id);
      return user ? [user] : [];
    })
    .filter((user) => {
      if (!canDiscoverUser(viewer, user.id)) return false;
      if (tokens.length === 0) return true;
      const haystack = normalizeText(`${user.displayName} ${user.username}`);
      return tokens.every((token) => haystack.includes(token));
    })
    .map((user) => projectUser(user, actorId));

  const members = matches.filter((user) => !isFanId(user.id)).sort(byFollowers);
  const fans = matches.filter((user) => isFanId(user.id)).sort((a, b) => a.id.localeCompare(b.id));
  const ordered = [...members, ...fans];

  const start = (page - 1) * FOLLOW_LIST_PAGE_SIZE;
  const users = ordered.slice(start, start + FOLLOW_LIST_PAGE_SIZE);
  return { users, nextPage: start + FOLLOW_LIST_PAGE_SIZE < ordered.length ? page + 1 : undefined };
}

function validatePatch({ displayName, bio, avatarUrl }: ProfilePatch): void {
  const name = displayName.trim();
  if (name.length < PROFILE_DISPLAY_NAME_MIN || name.length > PROFILE_DISPLAY_NAME_MAX) {
    throw new Error("Invalid display name");
  }
  if ((bio ?? "").length > PROFILE_BIO_MAX) throw new Error("Bio too long");
  if (avatarUrl) {
    try {
      new URL(avatarUrl);
    } catch {
      throw new Error("Invalid avatar URL");
    }
  }
}

/** Owner-only profile edit. The username is not editable (the mock session cookie identity stays valid). */
export async function updateProfile(id: string, patch: ProfilePatch, actorId: string): Promise<UserProfile> {
  if (isRealApi("content")) return real.updateProfile(id, patch, actorId);
  if (actorId !== id) throw new ForbiddenError(`Profile ${id} is not owned by ${actorId}`);
  validatePatch(patch);

  const user = db.get(id);
  if (!user) throw new Error(`Unknown user ${id}`);
  user.displayName = patch.displayName.trim();
  user.bio = patch.bio?.trim() || undefined;
  user.avatarUrl = patch.avatarUrl || undefined;

  await mockDelay();
  return projectUser(user, actorId);
}

/**
 * Registers the signed-in mock account as a user (runtime users are lost on reload, like every mock). No-op for
 * seed ids. Touches the graph node immediately so follow counts never jump later.
 */
export async function upsertViewerUser(input: ViewerUserInput, actorId: string): Promise<UserProfile> {
  if (isRealApi("content")) return real.upsertViewerUser(input, actorId);
  // Register always issues the same id: a different account reusing it replaces the row; the same account keeps its edits
  if (!isSeedUserId(input.id) && db.get(input.id)?.username !== input.username) {
    db.set(input.id, {
      id: input.id,
      username: input.username,
      displayName: input.displayName,
      ...(input.bio ? { bio: input.bio } : {}),
      ...(input.avatarUrl ? { avatarUrl: input.avatarUrl } : {}),
    });
  }
  getFollowingCount(input.id);

  await mockDelay();
  const user = db.get(input.id);
  if (!user) throw new Error(`Unknown user ${input.id}`);
  return projectUser(user, actorId);
}

import { normalizeText, tokenize } from "@/lib/text";
import { getFollowedAuthorIds, setFollowed } from "@/mocks/follow-graph";
import { MOCK_USERS } from "../mocks/mock-users";
import type { UserProfile, UserProfileBase } from "../types";

// Mock data source for users. Replace the bodies with real API calls when the backend is wired;
// callers (containers + user-store) stay unchanged. `viewerId` stands in for the JWT subject.

const SEARCH_LIMIT = 50;

let db = new Map<string, UserProfileBase>();

/** Test-only: restore the in-memory store from the seed dataset. */
export function __resetMockUsers(): void {
  db = new Map(MOCK_USERS.map((user) => [user.id, structuredClone(user)]));
}
__resetMockUsers();

function mockDelay(): Promise<void> {
  const ms = 300 + Math.random() * 300;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Copy with the viewer's follow flag, read from the follow graph at call time. */
function project(user: UserProfileBase, followed: ReadonlySet<string>): UserProfile {
  return { ...structuredClone(user), isFollowing: followed.has(user.id) };
}

const byFollowers = (a: UserProfileBase, b: UserProfileBase) => b.followersCount - a.followersCount;

/** Users matching every token over name, username & bio. Username-prefix hits first, then by followers. */
export async function searchUsers(query: string, viewerId: string, limit = SEARCH_LIMIT): Promise<UserProfile[]> {
  await mockDelay();

  const tokens = tokenize(query.trim().replace(/^@/, ""));
  if (tokens.length === 0) return [];

  const followed = getFollowedAuthorIds(viewerId);
  const startsWithFirst = (user: UserProfileBase) => normalizeText(user.username).startsWith(tokens[0]);
  return [...db.values()]
    .filter((user) => {
      const haystack = normalizeText(`${user.displayName} ${user.username} ${user.bio ?? ""}`);
      return tokens.every((token) => haystack.includes(token));
    })
    .sort((a, b) => Number(startsWithFirst(b)) - Number(startsWithFirst(a)) || byFollowers(a, b))
    .slice(0, limit)
    .map((user) => project(user, followed));
}

/** Users the viewer does not follow (never the viewer), most followed first. */
export async function fetchSuggestedUsers(limit: number, viewerId: string): Promise<UserProfile[]> {
  await mockDelay();

  const followed = getFollowedAuthorIds(viewerId);
  return [...db.values()]
    .filter((user) => user.id !== viewerId && !followed.has(user.id))
    .sort(byFollowers)
    .slice(0, limit)
    .map((user) => project(user, followed));
}

export async function fetchUser(id: string, viewerId: string): Promise<UserProfile | null> {
  await mockDelay();

  const user = db.get(id);
  return user ? project(user, getFollowedAuthorIds(viewerId)) : null;
}

/** Complete set of authors the viewer follows. */
export async function fetchFollowedIds(viewerId: string): Promise<string[]> {
  await mockDelay();
  return [...getFollowedAuthorIds(viewerId)];
}

/**
 * Persists follow state (idempotent set, applied before latency) so refetches don't clobber optimistic UI.
 * Follow flag is per viewer; the follower count is global.
 */
export async function setFollow(id: string, following: boolean, viewerId: string): Promise<void> {
  const user = db.get(id);
  if (user && getFollowedAuthorIds(viewerId).has(id) !== following) {
    setFollowed(viewerId, id, following);
    user.followersCount = Math.max(0, user.followersCount + (following ? 1 : -1));
  }
  await mockDelay();
}

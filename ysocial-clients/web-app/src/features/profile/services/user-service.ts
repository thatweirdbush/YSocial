import { normalizeText, tokenize } from "@/lib/text";
import { MOCK_USERS } from "../mocks/mock-users";
import type { UserProfile } from "../types";

// Mock data source for users. Replace the bodies with real API calls when the backend is wired;
// callers (containers + user-store) stay unchanged.

const SEARCH_LIMIT = 50;

let db = new Map<string, UserProfile>();

/** Test-only: restore the in-memory store from the seed dataset. */
export function __resetMockUsers(): void {
  db = new Map(MOCK_USERS.map((user) => [user.id, structuredClone(user)]));
}
__resetMockUsers();

function mockDelay(): Promise<void> {
  const ms = 300 + Math.random() * 300;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const copy = (user: UserProfile): UserProfile => structuredClone(user);

const byFollowers = (a: UserProfile, b: UserProfile) => b.followersCount - a.followersCount;

/** Users matching every token over name, username & bio. Username-prefix hits first, then by followers. */
export async function searchUsers(query: string, limit = SEARCH_LIMIT): Promise<UserProfile[]> {
  await mockDelay();

  const tokens = tokenize(query.trim().replace(/^@/, ""));
  if (tokens.length === 0) return [];

  const startsWithFirst = (user: UserProfile) => normalizeText(user.username).startsWith(tokens[0]);
  return [...db.values()]
    .filter((user) => {
      const haystack = normalizeText(`${user.displayName} ${user.username} ${user.bio ?? ""}`);
      return tokens.every((token) => haystack.includes(token));
    })
    .sort((a, b) => Number(startsWithFirst(b)) - Number(startsWithFirst(a)) || byFollowers(a, b))
    .slice(0, limit)
    .map(copy);
}

/** Users the current user does not follow, most followed first. */
export async function fetchSuggestedUsers(limit: number): Promise<UserProfile[]> {
  await mockDelay();

  return [...db.values()].filter((user) => !user.isFollowing).sort(byFollowers).slice(0, limit).map(copy);
}

/** Persists follow state (idempotent set, applied before latency) so refetches don't clobber optimistic UI. */
export async function setFollow(id: string, following: boolean): Promise<void> {
  const user = db.get(id);
  if (user && user.isFollowing !== following) {
    user.isFollowing = following;
    user.followersCount = Math.max(0, user.followersCount + (following ? 1 : -1));
  }
  await mockDelay();
}

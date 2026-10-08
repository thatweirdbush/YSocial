import { SEED_FOLLOWED_AUTHOR_IDS, SEED_FOLLOWING } from "./seed-authors";
import { SEED_FAN_FOLLOWS } from "./seed-fans";

// Mock backend follow table and the SOLE source of follow relations for every mock service. Stored as a forward
// index plus a reverse index, both mutated only through `link`, so follower / following counts are O(1) reads.

let following = new Map<string, Set<string>>();
let followers = new Map<string, Set<string>>();

/** The only mutation point: keeps both indexes in sync. Self-links are ignored; idempotent. */
function link(followerId: string, targetId: string, on: boolean): void {
  if (followerId === targetId) return;
  const out = followingOf(followerId);
  let incoming = followers.get(targetId);
  if (!incoming) {
    incoming = new Set();
    followers.set(targetId, incoming);
  }
  if (on) {
    out.add(targetId);
    incoming.add(followerId);
  } else {
    out.delete(targetId);
    incoming.delete(followerId);
  }
}

/** Forward set of `id`; an unknown id (e.g. a runtime-registered user) is materialized with the viewer default. */
function followingOf(id: string): Set<string> {
  let out = following.get(id);
  if (!out) {
    out = new Set();
    following.set(id, out);
    for (const targetId of SEED_FOLLOWED_AUTHOR_IDS) link(id, targetId, true);
  }
  return out;
}

function seedGraph(): void {
  following = new Map();
  followers = new Map();
  for (const [id, targets] of Object.entries(SEED_FOLLOWING)) {
    following.set(id, new Set());
    for (const targetId of targets) link(id, targetId, true);
  }
  for (const [baseId, fanIds] of Object.entries(SEED_FAN_FOLLOWS)) {
    for (const fanId of fanIds) {
      following.set(fanId, new Set());
      link(fanId, baseId, true);
    }
  }
}

seedGraph();

/** Authors `id` follows; unknown id -> lazily materialized. Returns a copy. */
export function getFollowedAuthorIds(id: string): ReadonlySet<string> {
  return new Set(followingOf(id));
}

/** Users following `id`. Returns a copy. */
export function getFollowerIds(id: string): ReadonlySet<string> {
  return new Set(followers.get(id));
}

export function getFollowingCount(id: string): number {
  return followingOf(id).size;
}

export function getFollowerCount(id: string): number {
  return followers.get(id)?.size ?? 0;
}

export function setFollowed(followerId: string, targetId: string, isFollowing: boolean): void {
  link(followerId, targetId, isFollowing);
}

/** Test-only: restore both indexes to the seed. */
export function __resetFollowGraph(): void {
  seedGraph();
}

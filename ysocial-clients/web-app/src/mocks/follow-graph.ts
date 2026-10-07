import { SEED_FOLLOWED_AUTHOR_IDS } from "./seed-authors";

// Mock backend follow table, scoped per viewer (login, register, guest & future profile switch each get
// their own set). The single source of follow truth for every mock service.

let graph = new Map<string, Set<string>>();

function followsOf(viewerId: string): Set<string> {
  let follows = graph.get(viewerId);
  if (!follows) {
    follows = new Set(SEED_FOLLOWED_AUTHOR_IDS.filter((id) => id !== viewerId));
    graph.set(viewerId, follows);
  }
  return follows;
}

/** Authors the viewer follows; unknown viewer -> lazily seeded. Returns a copy. */
export function getFollowedAuthorIds(viewerId: string): ReadonlySet<string> {
  return new Set(followsOf(viewerId));
}

export function setFollowed(viewerId: string, authorId: string, following: boolean): void {
  if (viewerId === authorId) return;
  const follows = followsOf(viewerId);
  if (following) follows.add(authorId);
  else follows.delete(authorId);
}

/** Test-only: drop every viewer so the next read re-seeds. */
export function __resetFollowGraph(): void {
  graph = new Map();
}

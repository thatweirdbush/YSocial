import { SEED_CLOSE_FRIENDS, SEED_FOLLOWED_AUTHOR_IDS, SEED_FOLLOWING } from "./seed-authors";
import { SEED_FAN_FOLLOWS } from "./seed-fans";

// Mock backend relation table (BE `UserRelation`) and the SOLE source of follow / close friend / mute relations
// for every mock service. Directed edges observer -> target, plus 2 reverse indexes (accepted followers, pending
// requests). Every edge mutation goes through `writeEdge`, so counts stay O(1) reads and indexes never drift.

export type FollowStatus = "none" | "pending" | "accepted";

export interface RelationEdge {
  status: FollowStatus;
  isCloseFriend: boolean;
  isMuted: boolean;
}

const NO_EDGE: RelationEdge = { status: "none", isCloseFriend: false, isMuted: false };

/** Pending follow requests per target (target -> requesters). Seed lives here: fans come from `seed-fans`. */
const SEED_PENDING: Readonly<Record<string, readonly string[]>> = {
  "1": ["author-02", "author-08", ...SEED_FAN_FOLLOWS["author-01"].slice(0, 2)],
  "author-05": ["1"],
};

let edges = new Map<string, Map<string, RelationEdge>>();
let followers = new Map<string, Set<string>>();
let requests = new Map<string, Set<string>>();

function indexOf(map: Map<string, Set<string>>, targetId: string): Set<string> {
  let set = map.get(targetId);
  if (!set) {
    set = new Set();
    map.set(targetId, set);
  }
  return set;
}

const isEmptyEdge = (edge: RelationEdge) => edge.status === "none" && !edge.isCloseFriend && !edge.isMuted;

/** The only mutation point: updates the edge and both reverse indexes. Self-edges are ignored. */
function writeEdge(observerId: string, targetId: string, patch: Partial<RelationEdge>): void {
  if (observerId === targetId) return;
  const out = edgesOf(observerId);
  const previous = out.get(targetId) ?? NO_EDGE;
  const next: RelationEdge = { ...previous, ...patch };

  if (isEmptyEdge(next)) out.delete(targetId);
  else out.set(targetId, next);

  if (previous.status !== next.status) {
    if (previous.status === "accepted") indexOf(followers, targetId).delete(observerId);
    if (previous.status === "pending") indexOf(requests, targetId).delete(observerId);
    if (next.status === "accepted") indexOf(followers, targetId).add(observerId);
    if (next.status === "pending") indexOf(requests, targetId).add(observerId);
  }
}

/** Outgoing edges of `id`; an unknown id (e.g. a runtime-registered user) is materialized with the viewer default. */
function edgesOf(id: string): Map<string, RelationEdge> {
  let out = edges.get(id);
  if (!out) {
    out = new Map();
    edges.set(id, out);
    for (const targetId of SEED_FOLLOWED_AUTHOR_IDS) writeEdge(id, targetId, { status: "accepted" });
  }
  return out;
}

function seedGraph(): void {
  edges = new Map();
  followers = new Map();
  requests = new Map();
  for (const [id, targetIds] of Object.entries(SEED_FOLLOWING)) {
    edges.set(id, new Map());
    for (const targetId of targetIds) writeEdge(id, targetId, { status: "accepted" });
  }
  for (const [baseId, fanIds] of Object.entries(SEED_FAN_FOLLOWS)) {
    for (const fanId of fanIds) {
      edges.set(fanId, new Map());
      writeEdge(fanId, baseId, { status: "accepted" });
    }
  }
  for (const [targetId, observerIds] of Object.entries(SEED_PENDING)) {
    for (const observerId of observerIds) writeEdge(observerId, targetId, { status: "pending" });
  }
  for (const [observerId, targetIds] of Object.entries(SEED_CLOSE_FRIENDS)) {
    for (const targetId of targetIds) writeEdge(observerId, targetId, { isCloseFriend: true });
  }
}

seedGraph();

// #region Reads
/** Edge observer -> target; never undefined (default none / false / false). Returns a copy. */
export function getEdge(observerId: string, targetId: string): RelationEdge {
  return { ...(edgesOf(observerId).get(targetId) ?? NO_EDGE) };
}

export function getFollowStatus(observerId: string, targetId: string): FollowStatus {
  return edgesOf(observerId).get(targetId)?.status ?? "none";
}

/** Authors `id` follows (accepted only); unknown id -> lazily materialized. Returns a copy. */
export function getFollowedIds(id: string): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const [targetId, edge] of edgesOf(id)) if (edge.status === "accepted") ids.add(targetId);
  return ids;
}

/** Users following `id` (accepted only). Returns a copy. */
export function getFollowerIds(id: string): ReadonlySet<string> {
  return new Set(followers.get(id));
}

/** Pending requesters of `id`, newest first. */
export function getRequestIds(id: string): string[] {
  return [...(requests.get(id) ?? [])].reverse();
}

export function getFollowingCount(id: string): number {
  let count = 0;
  for (const edge of edgesOf(id).values()) if (edge.status === "accepted") count++;
  return count;
}

export function getFollowerCount(id: string): number {
  return followers.get(id)?.size ?? 0;
}

/** Targets `observerId` marked as close friends; only effective on accepted edges (dormant flags excluded). */
export function getCloseFriendIds(observerId: string): string[] {
  const ids: string[] = [];
  for (const [targetId, edge] of edgesOf(observerId)) if (edge.status === "accepted" && edge.isCloseFriend) ids.push(targetId);
  return ids;
}

export function getMutedIds(observerId: string): string[] {
  const ids: string[] = [];
  for (const [targetId, edge] of edgesOf(observerId)) if (edge.isMuted) ids.push(targetId);
  return ids;
}
// #endregion

// #region Writes
/** Idempotent: none -> pending (private target) / accepted (public); pending & accepted are left unchanged. */
export function requestFollow(observerId: string, targetId: string, targetPrivate: boolean): FollowStatus {
  const current = getFollowStatus(observerId, targetId);
  if (current !== "none" || observerId === targetId) return current;
  const next: FollowStatus = targetPrivate ? "pending" : "accepted";
  writeEdge(observerId, targetId, { status: next });
  return next;
}

/** Idempotent: pending / accepted -> none. Close friend & mute flags stay (dormant, BE soft-delete parity). */
export function removeFollow(observerId: string, targetId: string): void {
  writeEdge(observerId, targetId, { status: "none" });
}

export function setCloseFriend(observerId: string, targetId: string, on: boolean): void {
  if (getFollowStatus(observerId, targetId) !== "accepted") throw new Error("Close friend requires accepted follow");
  writeEdge(observerId, targetId, { isCloseFriend: on });
}

export function setMutedEdge(observerId: string, targetId: string, on: boolean): void {
  writeEdge(observerId, targetId, { isMuted: on });
}

export function acceptRequest(observerId: string, targetId: string): void {
  if (getFollowStatus(observerId, targetId) === "pending") writeEdge(observerId, targetId, { status: "accepted" });
}

/** Accepts every pending request of `targetId`; O(k) for k requests. Returns k. */
export function acceptAllRequests(targetId: string): number {
  const pending = [...(requests.get(targetId) ?? [])];
  for (const observerId of pending) writeEdge(observerId, targetId, { status: "accepted" });
  return pending.length;
}
// #endregion

/** Test-only: restore every edge & index to the seed. */
export function __resetRelationGraph(): void {
  seedGraph();
}

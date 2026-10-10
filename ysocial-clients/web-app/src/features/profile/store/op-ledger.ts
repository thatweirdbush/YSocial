// Mutation-ordering ledger shared by `user-store` & `relation-store` (spec D18, D25). Plain module state, not a
// Zustand slice: nothing renders from it, and keeping it out of both stores avoids a user-store <-> relation-store cycle.
//
// - per-target op version: every optimistic op on a target (follow / block / mute / close friend, key = target id;
//   "self" for privacy; requester id for respond) bumps it, and an op reconciles ONLY IF its version is still current
// - per-actor mutation sequence: bumped by every op; a relation-sets load that started before a mutation is stale
// - viewer generation: bumped on every actor switch; a load from another generation never applies

let versions = new Map<string, Map<string, number>>();
let sequences = new Map<string, number>();
let generation = 0;

/** Starts an optimistic op on `key`: returns its version and bumps the actor's mutation sequence. */
export function beginOp(actorId: string, key: string): number {
  sequences.set(actorId, (sequences.get(actorId) ?? 0) + 1);
  let keys = versions.get(actorId);
  if (!keys) {
    keys = new Map();
    versions.set(actorId, keys);
  }
  const next = (keys.get(key) ?? 0) + 1;
  keys.set(key, next);
  return next;
}

/** True while no newer op started on `key` since `version`. */
export const isCurrentOp = (actorId: string, key: string, version: number): boolean =>
  (versions.get(actorId)?.get(key) ?? 0) === version;

export const getMutationSeq = (actorId: string): number => sequences.get(actorId) ?? 0;

export const getViewerGeneration = (): number => generation;

export function bumpViewerGeneration(): number {
  generation += 1;
  return generation;
}

/** Test-only: forget every op & generation. */
export function resetOpLedger(): void {
  versions = new Map();
  sequences = new Map();
  generation = 0;
}

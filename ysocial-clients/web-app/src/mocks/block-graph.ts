import { removeFollow } from "./relation-graph";

// Mock backend block table (BE `UserBlock`): blocker -> blocked. Blocking purges follows & pending requests in
// both directions through the relation graph; close friend & mute flags are left untouched (dormant).

let blocks = new Map<string, Set<string>>();

/** Self-block is a defensive no-op (services reject it earlier with `CannotBlockYourselfError`). */
export function setBlocked(blockerId: string, blockedId: string, on: boolean): void {
  if (blockerId === blockedId) return;
  if (on) {
    let set = blocks.get(blockerId);
    if (!set) {
      set = new Set();
      blocks.set(blockerId, set);
    }
    // Re-adding moves the id to the newest position
    set.delete(blockedId);
    set.add(blockedId);
    removeFollow(blockerId, blockedId);
    removeFollow(blockedId, blockerId);
  } else {
    blocks.get(blockerId)?.delete(blockedId);
  }
}

export function isBlocked(blockerId: string, blockedId: string): boolean {
  return blocks.get(blockerId)?.has(blockedId) ?? false;
}

export function isEitherBlocked(a: string, b: string): boolean {
  return isBlocked(a, b) || isBlocked(b, a);
}

/** Ids blocked by `id`, newest first. */
export function getBlockedIds(id: string): string[] {
  return [...(blocks.get(id) ?? [])].reverse();
}

/** Test-only: clear every block. */
export function __resetBlockGraph(): void {
  blocks = new Map();
}

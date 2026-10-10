import { acceptAllRequests } from "./relation-graph";

// Mock backend privacy settings (BE `PrivacySettings.IsPrivate`). Private accounts stay discoverable; only content
// & follows are gated (see `visibility.ts`).

export const SEED_PRIVATE_IDS: readonly string[] = ["1", "author-05", "author-07"];

let privateIds = new Set<string>(SEED_PRIVATE_IDS);

export function isPrivate(id: string): boolean {
  return privateIds.has(id);
}

/** Going public auto-accepts every pending request; returns how many were accepted (0 when going private). */
export function setPrivate(id: string, value: boolean): number {
  if (value) {
    privateIds.add(id);
    return 0;
  }
  privateIds.delete(id);
  return acceptAllRequests(id);
}

/** Test-only: restore the seed. */
export function __resetPrivacy(): void {
  privateIds = new Set(SEED_PRIVATE_IDS);
}

import type { MockSessionIdentity } from "@/features/auth";
import { getSeedUserByUsername } from "../mocks/mock-users";
import type { StoredUser } from "../types";

// Pure & server-safe: the only inputs are the route segment and the mock session identity (spec D7/D8).

export type ProfileRouteResolution =
  | { kind: "seed"; user: StoredUser }
  | { kind: "session"; identity: MockSessionIdentity }
  | null;

/** `/@Name`, `/%40name` -> `name`. A malformed encoding keeps the raw segment instead of throwing. */
export function normalizeUsername(raw: string): string {
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // keep the raw segment: it simply resolves to nothing
  }
  return decoded.replace(/^@/, "").toLowerCase();
}

/**
 * Seed users win; otherwise only the current session's own runtime user resolves. Another session's runtime user
 * is a 404 on purpose: there is no server-side fake DB (spec D7).
 */
export function resolveProfileRoute(username: string, session: MockSessionIdentity | null): ProfileRouteResolution {
  const normalized = normalizeUsername(username);
  const seed = getSeedUserByUsername(normalized);
  if (seed) return { kind: "seed", user: seed };
  if (session && session.username === normalized) return { kind: "session", identity: session };
  return null;
}

import type { AuthUser, MockSessionIdentity } from "../types";

// Mock bridge only - NOT an auth/security boundary (spec D8). The cookie is client-writable; it only
// lets the server resolve the current mock session's runtime user for `/@username`. Never reuse as real auth.

export const MOCK_SESSION_COOKIE = "ysocial_mock_user";
export const MOCK_SESSION_MAX_AGE = 2_592_000;
export const USERNAME_PATTERN = /^[a-z0-9._]{1,30}$/;

export function serializeMockSession({ id, username }: MockSessionIdentity): string {
  return encodeURIComponent(JSON.stringify({ id, username }));
}

/** Never throws; anything malformed resolves to `null`. Cannot detect tampering. */
export function parseMockSession(raw: string | undefined): MockSessionIdentity | null {
  if (!raw) return null;
  try {
    const data: unknown = JSON.parse(decodeURIComponent(raw));
    if (data === null || typeof data !== "object") return null;
    const { id, username } = data as Record<string, unknown>;
    if (typeof id !== "string" || id.length === 0) return null;
    if (typeof username !== "string") return null;
    const normalized = username.toLowerCase();
    if (!USERNAME_PATTERN.test(normalized)) return null;
    return { id, username: normalized };
  } catch {
    return null;
  }
}

export function toMockSession(user: AuthUser): MockSessionIdentity {
  return { id: user.id, username: (user.username ?? user.email.split("@")[0]).toLowerCase() };
}

/** Client-only. */
export function writeMockSessionCookie(identity: MockSessionIdentity): void {
  if (typeof document === "undefined") return;
  document.cookie = `${MOCK_SESSION_COOKIE}=${serializeMockSession(identity)}; path=/; SameSite=Lax; max-age=${MOCK_SESSION_MAX_AGE}`;
}

/** Client-only. */
export function clearMockSessionCookie(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${MOCK_SESSION_COOKIE}=; path=/; SameSite=Lax; max-age=0`;
}

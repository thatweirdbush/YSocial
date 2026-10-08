import { create } from "zustand";
import type { AuthUser } from "../types";
import { clearMockSessionCookie, toMockSession, writeMockSessionCookie } from "../utils/mock-session";

const ACCESS_TOKEN_KEY = "ysocial_access_token";
const REFRESH_TOKEN_KEY = "ysocial_refresh_token";
const USER_KEY = "ysocial_user";

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  /** False until `hydrate()` has read persisted state on the client. Identity-dependent UI waits for it. */
  hydrated: boolean;
  actions: {
    setTokens: (accessToken: string, refreshToken: string) => void;
    updateUser: (user: AuthUser) => void;
    clearAuth: () => void;
    /** Applies persisted auth (localStorage) and syncs the identity cookie. Client-only, idempotent. */
    hydrate: () => void;
  };
}

/** Reads a persisted user; malformed JSON drops the key and resolves to `null`. */
const readStoredUser = (): AuthUser | null => {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    localStorage.removeItem(USER_KEY);
    return null;
  }
};

export const useAuthStore = create<AuthState>((set, get) => ({
  // Fixed initial state: server and first client render must match (never read storage here).
  accessToken: null,
  refreshToken: null,
  user: null,
  isAuthenticated: false,
  hydrated: false,
  actions: {
    setTokens: (accessToken, refreshToken) => {
      if (typeof window !== "undefined") {
        localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
        localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
      }
      set({ accessToken, refreshToken, isAuthenticated: true });
    },
    updateUser: (user) => {
      if (typeof window !== "undefined") {
        localStorage.setItem(USER_KEY, JSON.stringify(user));
      }
      writeMockSessionCookie(toMockSession(user));
      set({ user });
    },
    clearAuth: () => {
      if (typeof window !== "undefined") {
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
      }
      clearMockSessionCookie();
      set({ accessToken: null, refreshToken: null, user: null, isAuthenticated: false });
    },
    hydrate: () => {
      if (get().hydrated || typeof window === "undefined") return;
      const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
      const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
      const user = readStoredUser();
      set({ accessToken, refreshToken, user, isAuthenticated: !!accessToken, hydrated: true });
      if (user) {
        writeMockSessionCookie(toMockSession(user));
      } else {
        clearMockSessionCookie();
      }
    },
  },
}));

// Selector hooks for highly efficient component updates without redundant re-renders
export const useAccessToken = () => useAuthStore((state) => state.accessToken);
export const useRefreshToken = () => useAuthStore((state) => state.refreshToken);
export const useAuthUser = () => useAuthStore((state) => state.user);
export const useIsAuthenticated = () => useAuthStore((state) => state.isAuthenticated);
export const useAuthHydrated = () => useAuthStore((state) => state.hydrated);
export const useAuthActions = () => useAuthStore((state) => state.actions);

/** Actor id used when nobody is signed in (matches the guest post author). */
export const GUEST_ACTOR_ID = "me";

/** Authenticated identity: the signed-in user id, or `null` for guests. Use for own-profile / permission checks. */
export const useViewerId = (): string | null => useAuthStore((state) => state.user?.id ?? null);

/**
 * Legacy mock mutation actor: signed-in user id or the guest actor. Scopes follow/like/bookmark state in mock
 * services & stores ONLY - never for own-profile checks, Saved visibility, edit permission, auth state or routing.
 */
export const useActorId = (): string => useAuthStore((state) => state.user?.id ?? GUEST_ACTOR_ID);

/** Non-hook twin of `useActorId` for module functions and tests. */
export const getActorId = (): string => useAuthStore.getState().user?.id ?? GUEST_ACTOR_ID;

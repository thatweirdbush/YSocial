import { create } from "zustand";
import type { AuthUser } from "../types";

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  actions: {
    setTokens: (accessToken: string, refreshToken: string) => void;
    updateUser: (user: AuthUser) => void;
    clearAuth: () => void;
  };
}

export const useAuthStore = create<AuthState>((set) => {
  // Client-safe initial state loading
  let initialAccess: string | null = null;
  let initialRefresh: string | null = null;
  let initialUser: AuthUser | null = null;

  if (typeof window !== "undefined") {
    initialAccess = localStorage.getItem("ysocial_access_token");
    initialRefresh = localStorage.getItem("ysocial_refresh_token");
    const savedUser = localStorage.getItem("ysocial_user");
    if (savedUser) {
      try {
        initialUser = JSON.parse(savedUser);
      } catch {
        initialUser = null;
      }
    }
  }

  return {
    accessToken: initialAccess,
    refreshToken: initialRefresh,
    user: initialUser,
    isAuthenticated: !!initialAccess,
    actions: {
      setTokens: (accessToken, refreshToken) => {
        if (typeof window !== "undefined") {
          localStorage.setItem("ysocial_access_token", accessToken);
          localStorage.setItem("ysocial_refresh_token", refreshToken);
        }
        set({ accessToken, refreshToken, isAuthenticated: true });
      },
      updateUser: (user) => {
        if (typeof window !== "undefined") {
          localStorage.setItem("ysocial_user", JSON.stringify(user));
        }
        set({ user });
      },
      clearAuth: () => {
        if (typeof window !== "undefined") {
          localStorage.removeItem("ysocial_access_token");
          localStorage.removeItem("ysocial_refresh_token");
          localStorage.removeItem("ysocial_user");
        }
        set({ accessToken: null, refreshToken: null, user: null, isAuthenticated: false });
      },
    },
  };
});

// Selector hooks for highly efficient component updates without redundant re-renders
export const useAccessToken = () => useAuthStore((state) => state.accessToken);
export const useRefreshToken = () => useAuthStore((state) => state.refreshToken);
export const useAuthUser = () => useAuthStore((state) => state.user);
export const useIsAuthenticated = () => useAuthStore((state) => state.isAuthenticated);
export const useAuthActions = () => useAuthStore((state) => state.actions);

/** Viewer id used when nobody is signed in (matches the guest post author). */
export const GUEST_VIEWER_ID = "me";

/** Id of whoever is viewing: signed-in user or guest. Scopes follow state in mock services & stores. */
export const useViewerId = () => useAuthStore((state) => state.user?.id ?? GUEST_VIEWER_ID);

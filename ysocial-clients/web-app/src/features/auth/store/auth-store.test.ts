import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { clearMockSessionCookie, MOCK_SESSION_COOKIE, parseMockSession } from "../utils/mock-session";

const USER = { id: "1", email: "member@ysocial.dev", displayName: "YSocial Member", username: "ysocial_member" };

const readCookie = (): string | undefined => {
  const match = document.cookie.split("; ").find((entry) => entry.startsWith(`${MOCK_SESSION_COOKIE}=`));
  return match?.slice(MOCK_SESSION_COOKIE.length + 1);
};

const seedStorage = () => {
  localStorage.setItem("ysocial_access_token", "access");
  localStorage.setItem("ysocial_refresh_token", "refresh");
  localStorage.setItem("ysocial_user", JSON.stringify(USER));
};

/** Re-imports the module so the store initializer runs again against the current localStorage. */
const freshStore = async () => {
  vi.resetModules();
  return import("./auth-store");
};

describe("auth-store", () => {
  beforeEach(() => {
    localStorage.removeItem("ysocial_access_token");
    localStorage.removeItem("ysocial_refresh_token");
    localStorage.removeItem("ysocial_user");
    clearMockSessionCookie();
  });

  it("starts signed-out and unhydrated even when localStorage is populated (SSR-safe)", async () => {
    seedStorage();
    const { useAuthStore } = await freshStore();
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.hydrated).toBe(false);
  });

  it("hydrate() loads user & tokens and flips hydrated in ONE update, then mirrors the identity cookie", async () => {
    seedStorage();
    const { useAuthStore } = await freshStore();
    const listener = vi.fn();
    useAuthStore.subscribe(listener);

    useAuthStore.getState().actions.hydrate();

    expect(listener).toHaveBeenCalledTimes(1);
    const state = useAuthStore.getState();
    expect(state.user).toEqual(USER);
    expect(state.accessToken).toBe("access");
    expect(state.isAuthenticated).toBe(true);
    expect(state.hydrated).toBe(true);
    expect(parseMockSession(readCookie())).toEqual({ id: "1", username: "ysocial_member" });
    expect(decodeURIComponent(readCookie() ?? "")).not.toContain("displayName");
  });

  it("hydrate() treats malformed ysocial_user as signed out, removes the key and clears the cookie", async () => {
    localStorage.setItem("ysocial_user", "{not json");
    document.cookie = `${MOCK_SESSION_COOKIE}=stale; path=/`;
    const { useAuthStore } = await freshStore();

    useAuthStore.getState().actions.hydrate();

    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().hydrated).toBe(true);
    expect(localStorage.getItem("ysocial_user")).toBeNull();
    expect(readCookie()).toBeUndefined();
  });

  it("hydrate() is idempotent", async () => {
    seedStorage();
    const { useAuthStore } = await freshStore();
    useAuthStore.getState().actions.hydrate();
    const listener = vi.fn();
    useAuthStore.subscribe(listener);

    useAuthStore.getState().actions.hydrate();

    expect(listener).not.toHaveBeenCalled();
  });

  it("updateUser writes the identity cookie with ONLY { id, username }", async () => {
    const { useAuthStore } = await freshStore();
    useAuthStore.getState().actions.updateUser({ ...USER, bio: "private bio" });
    expect(parseMockSession(readCookie())).toEqual({ id: "1", username: "ysocial_member" });
    expect(decodeURIComponent(readCookie() ?? "")).not.toContain("bio");
  });

  it("clearAuth clears the cookie", async () => {
    const { useAuthStore } = await freshStore();
    useAuthStore.getState().actions.updateUser(USER);
    useAuthStore.getState().actions.clearAuth();
    expect(readCookie()).toBeUndefined();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it("useViewerId is null for guests and the user id once signed in", async () => {
    const { useAuthStore, useViewerId } = await freshStore();
    const { result } = renderHook(() => useViewerId());
    expect(result.current).toBeNull();
    useAuthStore.getState().actions.updateUser(USER);
    const { result: after } = renderHook(() => useViewerId());
    expect(after.current).toBe("1");
  });

  it("useActorId falls back to the legacy guest actor", async () => {
    const { useActorId, GUEST_ACTOR_ID } = await freshStore();
    const { result } = renderHook(() => useActorId());
    expect(result.current).toBe("me");
    expect(GUEST_ACTOR_ID).toBe("me");
  });
});

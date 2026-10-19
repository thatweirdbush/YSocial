import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { dispatchStorage, setRealSlices } from "@/test/api-test-utils";

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

describe("auth-store cross-tab sync", () => {
  const REAL_USER = { id: "0b8f1c52-6a3e-4c53-9b42-5f9d6f7a1e10", email: "real@ysocial.dev", username: "real_user" };

  beforeEach(() => {
    localStorage.clear();
    clearMockSessionCookie();
  });

  const setup = async () => {
    const mod = await freshStore();
    const stop = mod.registerAuthStorageSync();
    return { ...mod, stop };
  };

  it("setTokens in other tab (2 events) -> store ends with both new tokens", async () => {
    const { useAuthStore, stop } = await setup();
    localStorage.setItem("ysocial_access_token", "A2");
    localStorage.setItem("ysocial_refresh_token", "R2");
    dispatchStorage("ysocial_access_token", "A2", "A1");
    dispatchStorage("ysocial_refresh_token", "R2", "R1");
    const state = useAuthStore.getState();
    expect([state.accessToken, state.refreshToken, state.isAuthenticated]).toEqual(["A2", "R2", true]);
    stop();
  });

  it("clearAuth in other tab (3 events) -> single cleared state", async () => {
    const { useAuthStore, stop } = await setup();
    useAuthStore.getState().actions.setTokens("A1", "R1");
    useAuthStore.getState().actions.updateUser(USER);
    localStorage.clear();
    const listener = vi.fn();
    useAuthStore.subscribe(listener);
    dispatchStorage("ysocial_access_token", null, "A1");
    dispatchStorage("ysocial_refresh_token", null, "R1");
    dispatchStorage("ysocial_user", null, "{}");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState()).toMatchObject({ accessToken: null, refreshToken: null, user: null, isAuthenticated: false });
    expect(readCookie()).toBeUndefined();
    stop();
  });

  it("sync never writes back to storage (no loop)", async () => {
    const { stop } = await setup();
    localStorage.setItem("ysocial_access_token", "A2");
    localStorage.setItem("ysocial_refresh_token", "R2");
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const removeItem = vi.spyOn(Storage.prototype, "removeItem");
    dispatchStorage("ysocial_access_token", "A2", "A1");
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    vi.restoreAllMocks();
    stop();
  });

  it("ignores unrelated keys & cleanup removes the listener", async () => {
    const { useAuthStore, stop } = await setup();
    localStorage.setItem("ysocial_access_token", "A2");
    localStorage.setItem("ysocial_refresh_token", "R2");
    dispatchStorage("some_other_key", "x");
    expect(useAuthStore.getState().accessToken).toBeNull();
    stop();
    dispatchStorage("ysocial_access_token", "A2", null);
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it("hydrate real mode drops mock_ tokens", async () => {
    setRealSlices("auth");
    localStorage.setItem("ysocial_access_token", "mock_access_token");
    localStorage.setItem("ysocial_refresh_token", "mock_refresh_token");
    const { useAuthStore } = await freshStore();
    useAuthStore.getState().actions.hydrate();
    expect(useAuthStore.getState()).toMatchObject({ accessToken: null, isAuthenticated: false, hydrated: true });
    expect(localStorage.getItem("ysocial_access_token")).toBeNull();
  });

  it("hydrate real mode drops non-GUID user id", async () => {
    setRealSlices("auth");
    localStorage.setItem("ysocial_access_token", "real.jwt");
    localStorage.setItem("ysocial_refresh_token", "real-refresh");
    localStorage.setItem("ysocial_user", JSON.stringify(USER));
    const { useAuthStore } = await freshStore();
    useAuthStore.getState().actions.hydrate();
    expect(useAuthStore.getState()).toMatchObject({ user: null, isAuthenticated: false });
    expect(localStorage.getItem("ysocial_user")).toBeNull();
  });

  it("hydrate real mode keeps a real session", async () => {
    setRealSlices("auth");
    localStorage.setItem("ysocial_access_token", "real.jwt");
    localStorage.setItem("ysocial_refresh_token", "real-refresh");
    localStorage.setItem("ysocial_user", JSON.stringify(REAL_USER));
    const { useAuthStore } = await freshStore();
    useAuthStore.getState().actions.hydrate();
    expect(useAuthStore.getState()).toMatchObject({ user: REAL_USER, isAuthenticated: true });
  });

  it("hydrate mock mode unchanged (mock tokens kept)", async () => {
    seedStorage();
    localStorage.setItem("ysocial_access_token", "mock_access_token");
    const { useAuthStore } = await freshStore();
    useAuthStore.getState().actions.hydrate();
    expect(useAuthStore.getState()).toMatchObject({ accessToken: "mock_access_token", user: USER });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL } from "@/lib/api-config";
import * as tokenRefresh from "@/lib/token-refresh";
import { createLockFake, dispatchStorage, mockFetchSequence, problem, setRealSlices, type MockStep } from "@/test/api-test-utils";
import { AUTH_STORAGE_KEYS, registerAuthStorageSync, useAuthStore } from "../store/auth-store";
import type { AuthUser, ProfileSummary } from "../types";
import { authService } from "./auth-service";
import { SwitchInProgressError, SwitchSessionLostError, SwitchUnconfirmedError } from "./switch-profile";

const USER: AuthUser = { id: "p-main", email: "real@ysocial.dev", username: "main_user", displayName: "Main User" };
const TARGET: ProfileSummary = { id: "p-alt", username: "alt_user", displayName: "Alt User", avatarUrl: "https://img/alt.png", isDefault: false };
const SWITCH_URL = `${API_BASE_URL}/api/users/profiles/switch`;
const REFRESH_URL = `${API_BASE_URL}/api/identities/refresh-token`;

const switchedOk: MockStep = { status: 200, body: { accessToken: "A2", refreshToken: "R2", refreshTokenExpiry: "2030-01-01T00:00:00Z" } };
const rotatedOk: MockStep = { status: 200, body: { accessToken: "AR", refreshToken: "RR" } };
const networkDown: MockStep = { status: 0, reject: new TypeError("Failed to fetch") };
const timedOut: MockStep = { status: 0, reject: new DOMException("signal timed out", "TimeoutError") };

const stored = () => ({
  access: localStorage.getItem(AUTH_STORAGE_KEYS.access),
  refresh: localStorage.getItem(AUTH_STORAGE_KEYS.refresh),
  user: localStorage.getItem(AUTH_STORAGE_KEYS.user),
});
const storage = () => JSON.stringify(stored());

function seedSession(access = "A1", refresh = "R1") {
  localStorage.setItem(AUTH_STORAGE_KEYS.access, access);
  localStorage.setItem(AUTH_STORAGE_KEYS.refresh, refresh);
  localStorage.setItem(AUTH_STORAGE_KEYS.user, JSON.stringify(USER));
  useAuthStore.setState({ accessToken: access, refreshToken: refresh, user: USER, isAuthenticated: true, hydrated: true });
}

const bodyOf = (call: { init?: RequestInit }) => JSON.parse(String(call.init?.body));
const authOf = (call: { init?: RequestInit }) => (call.init?.headers as Record<string, string>).Authorization;
const gate = () => {
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => (open = resolve));
  return { open, opened };
};
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 20));

let locks = createLockFake();
const run = (steps: MockStep[]) => {
  const fake = mockFetchSequence(steps);
  return { ...fake, switching: () => authService.switchProfile(TARGET, { locks, fetchFn: fake.fetchFn }) };
};

beforeEach(() => {
  setRealSlices("auth");
  localStorage.clear();
  useAuthStore.getState().actions.clearAuth();
  seedSession();
  locks = createLockFake();
  // The post-commit `GET me` snapshot refresh goes through the global fetch: offline unless a test says otherwise
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("switchProfile: clean path", () => {
  it("PUTs with the stored tokens and commits tokens + summary-derived user in ONE store update", async () => {
    const { switching, calls } = run([switchedOk]);
    const seen: Array<{ access: string | null; user: string | undefined }> = [];
    const off = useAuthStore.subscribe((state) => seen.push({ access: state.accessToken, user: state.user?.id }));

    const user = await switching();
    off();

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(SWITCH_URL);
    expect(calls[0].init?.method).toBe("PUT");
    expect(authOf(calls[0])).toBe("Bearer A1");
    expect(bodyOf(calls[0])).toEqual({ profileId: "p-alt", refreshToken: "R1" });
    expect(user).toEqual({ id: "p-alt", email: "real@ysocial.dev", username: "alt_user", displayName: "Alt User", avatarUrl: "https://img/alt.png" });
    expect(seen).toEqual([{ access: "A2", user: "p-alt" }]);
    expect(stored()).toMatchObject({ access: "A2", refresh: "R2" });
  });

  it("reads the tokens from localStorage inside the lock, ignoring a stale store (another tab rotated)", async () => {
    localStorage.setItem(AUTH_STORAGE_KEYS.access, "A5");
    localStorage.setItem(AUTH_STORAGE_KEYS.refresh, "R5");
    const { switching, calls } = run([switchedOk]);

    await switching();

    expect(authOf(calls[0])).toBe("Bearer A5");
    expect(bodyOf(calls[0]).refreshToken).toBe("R5");
  });

  it("no rotation while the access token is still accepted", async () => {
    const { switching, calls } = run([switchedOk]);

    await switching();

    expect(calls.filter((call) => call.url === REFRESH_URL)).toHaveLength(0);
  });

  it("the new tokens + user are in localStorage BEFORE the lock is released; a queued refresh adopts them without a request", async () => {
    let atRelease: ReturnType<typeof stored> | null = null;
    const base = locks;
    const instrumented = {
      request: async <T,>(name: string, callback: () => Promise<T>): Promise<T> =>
        base.request(name, async () => {
          const result = await callback();
          atRelease = stored();
          return result;
        }),
    };
    locks = instrumented;
    const { switching, calls, fetchFn } = run([switchedOk]);

    const switched = switching();
    const queued = tokenRefresh.refreshTokens("A1", { locks, fetchFn });
    await switched;

    expect(atRelease).toMatchObject({ access: "A2", refresh: "R2" });
    expect(JSON.parse(atRelease!.user!)).toMatchObject({ id: "p-alt" });
    expect(await queued).toMatchObject({ status: "adopted", accessToken: "A2", refreshToken: "R2" });
    expect(calls).toHaveLength(1);
  });

  it("another tab ends consistent through the storage sync (tokens + user)", async () => {
    const { switching } = run([switchedOk]);
    await switching();
    // This tab's store is what the other tab still holds: the old pair
    useAuthStore.setState({ accessToken: "A1", refreshToken: "R1", user: USER });
    const off = registerAuthStorageSync();

    dispatchStorage(AUTH_STORAGE_KEYS.access, "A2");
    off();

    expect(useAuthStore.getState()).toMatchObject({ accessToken: "A2", refreshToken: "R2", user: { id: "p-alt" } });
  });
});

describe("switchProfile: access token rejected (expired)", () => {
  it("rotates once through the UNLOCKED rotation, persists the rotated pair, retries the PUT once", async () => {
    // The non-reentrant lock fake hangs this test if `refreshTokens` were called inside the switch lock
    const { switching, calls } = run([problem(401, "Unauthenticated"), rotatedOk, switchedOk]);

    await switching();

    expect(calls.map((call) => call.url)).toEqual([SWITCH_URL, REFRESH_URL, SWITCH_URL]);
    expect(bodyOf(calls[1])).toEqual({ refreshToken: "R1" });
    expect(authOf(calls[2])).toBe("Bearer AR");
    expect(bodyOf(calls[2])).toEqual({ profileId: "p-alt", refreshToken: "RR" });
    expect(stored()).toMatchObject({ access: "A2", refresh: "R2" });
  });

  it("any 401 that is not InvalidRefreshToken (even an empty body) counts as a rejected access token", async () => {
    const { switching, calls } = run([{ status: 401 }, rotatedOk, switchedOk]);

    await switching();

    expect(calls.map((call) => call.url)).toEqual([SWITCH_URL, REFRESH_URL, SWITCH_URL]);
  });

  it("the rotated pair stays persisted (store + localStorage) when the retried PUT is then refused", async () => {
    const { switching } = run([problem(401, "Unauthenticated"), rotatedOk, problem(403, "ProfileNotOwned")]);

    await expect(switching()).rejects.toMatchObject({ code: "ProfileNotOwned" });

    expect(stored()).toMatchObject({ access: "AR", refresh: "RR" });
    expect(useAuthStore.getState()).toMatchObject({ accessToken: "AR", refreshToken: "RR", user: USER });
  });

  it("a transient rotation failure is a clean failure: no retry, state untouched", async () => {
    const before = storage();
    const { switching, calls } = run([problem(401, "Unauthenticated"), networkDown]);

    await expect(switching()).rejects.toMatchObject({ kind: "network" });

    expect(calls).toHaveLength(2);
    expect(storage()).toBe(before);
    expect(useAuthStore.getState().user).toEqual(USER);
  });

  it("an unauthorized rotation ends the session", async () => {
    const { switching } = run([problem(401, "Unauthenticated"), problem(401, "InvalidRefreshToken")]);

    await expect(switching()).rejects.toBeInstanceOf(SwitchSessionLostError);

    expect(useAuthStore.getState().user).toBeNull();
    expect(stored()).toEqual({ access: null, refresh: null, user: null });
  });
});

describe("switchProfile: definitive failures", () => {
  it("403 ProfileNotOwned rejects with the ApiError and leaves every byte of storage untouched", async () => {
    const before = storage();
    const { switching } = run([problem(403, "ProfileNotOwned")]);

    await expect(switching()).rejects.toMatchObject({ status: 403, code: "ProfileNotOwned" });

    expect(storage()).toBe(before);
    expect(useAuthStore.getState()).toMatchObject({ accessToken: "A1", user: USER });
  });

  it("401 InvalidRefreshToken ends the session", async () => {
    const { switching } = run([problem(401, "InvalidRefreshToken")]);

    await expect(switching()).rejects.toBeInstanceOf(SwitchSessionLostError);

    expect(useAuthStore.getState()).toMatchObject({ user: null, accessToken: null, refreshToken: null });
  });

  it("401 InvalidRefreshToken but another tab rotated meanwhile: clean failure, session kept", async () => {
    const { fetchFn: inner } = mockFetchSequence([problem(401, "InvalidRefreshToken")]);
    const fetchFn = (async (...args: Parameters<typeof fetch>) => {
      localStorage.setItem(AUTH_STORAGE_KEYS.access, "A9");
      localStorage.setItem(AUTH_STORAGE_KEYS.refresh, "R9");
      return inner(...args);
    }) as typeof fetch;

    const failure = await authService.switchProfile(TARGET, { locks, fetchFn }).catch((error: unknown) => error);

    expect(failure).not.toBeInstanceOf(SwitchSessionLostError);
    expect(stored()).toMatchObject({ access: "A9", refresh: "R9" });
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.user)).not.toBeNull();
  });
});

describe("switchProfile: failures before anything is sent", () => {
  it.each([
    ["no stored refresh token", () => localStorage.removeItem(AUTH_STORAGE_KEYS.refresh)],
    ["no stored access token", () => localStorage.removeItem(AUTH_STORAGE_KEYS.access)],
  ])("%s: plain error, no request, storage untouched", async (_name, arrange) => {
    arrange();
    const before = storage();
    const { switching, calls } = run([]);

    await expect(switching()).rejects.toThrow();

    expect(calls).toHaveLength(0);
    expect(storage()).toBe(before);
  });

  it("an incomplete profile summary is refused before the lock", async () => {
    const { calls, fetchFn } = run([]);

    await expect(authService.switchProfile({ id: "p-alt" }, { locks, fetchFn })).rejects.toThrow();

    expect(calls).toHaveLength(0);
  });

  it("mock mode cannot switch profiles", async () => {
    setRealSlices("");
    const { switching, calls } = run([]);

    await expect(switching()).rejects.toThrow();

    expect(calls).toHaveLength(0);
  });
});

describe("switchProfile: ambiguous failures (no response / 5xx: the BE may have rotated)", () => {
  it.each([
    ["network error", networkDown],
    ["15s timeout", timedOut],
    ["HTTP 500", problem(500, "InternalError")],
  ])("%s: retries the SAME PUT once and commits on success", async (_name, first) => {
    const { switching, calls } = run([first, switchedOk]);

    await switching();

    expect(calls).toHaveLength(2);
    expect(calls[1].url).toBe(SWITCH_URL);
    expect(bodyOf(calls[1])).toEqual(bodyOf(calls[0]));
    expect(authOf(calls[1])).toBe(authOf(calls[0]));
    expect(stored()).toMatchObject({ access: "A2", refresh: "R2" });
  });

  it("the retry answers 401 InvalidRefreshToken: the new token was never received, session lost", async () => {
    const { switching } = run([networkDown, problem(401, "InvalidRefreshToken")]);

    await expect(switching()).rejects.toBeInstanceOf(SwitchSessionLostError);

    expect(useAuthStore.getState().user).toBeNull();
    expect(stored()).toEqual({ access: null, refresh: null, user: null });
  });

  it("the retry meets an expired access token: rotation says the refresh token is dead -> session lost", async () => {
    const { switching } = run([timedOut, problem(401, "Unauthenticated"), problem(401, "InvalidRefreshToken")]);

    await expect(switching()).rejects.toBeInstanceOf(SwitchSessionLostError);

    expect(useAuthStore.getState().user).toBeNull();
  });

  it("the retry meets an expired access token and rotation works: unconfirmed, rotated pair kept in store + storage", async () => {
    const { switching } = run([timedOut, problem(401, "Unauthenticated"), rotatedOk]);

    await expect(switching()).rejects.toBeInstanceOf(SwitchUnconfirmedError);

    expect(stored()).toMatchObject({ access: "AR", refresh: "RR" });
    expect(useAuthStore.getState()).toMatchObject({ accessToken: "AR", refreshToken: "RR", user: USER });
  });

  it("the retry meets an expired access token: rotation says the refresh token is dead -> session lost", async () => {
    const { switching } = run([timedOut, problem(401, "Unauthenticated"), problem(401, "InvalidRefreshToken")]);

    await expect(switching()).rejects.toBeInstanceOf(SwitchSessionLostError);

    expect(useAuthStore.getState().user).toBeNull();
  });

  it("the retry meets an expired access token and rotation works: unconfirmed, rotated pair kept in store + storage", async () => {
    const { switching } = run([timedOut, problem(401, "Unauthenticated"), rotatedOk]);

    await expect(switching()).rejects.toBeInstanceOf(SwitchUnconfirmedError);

    expect(stored()).toMatchObject({ access: "AR", refresh: "RR" });
    expect(useAuthStore.getState()).toMatchObject({ accessToken: "AR", refreshToken: "RR", user: USER });
  });

  it("a second ambiguous failure leaves state untouched & asks the user to check", async () => {
    const before = storage();
    const { switching, calls } = run([networkDown, problem(502, "BadGateway")]);

    await expect(switching()).rejects.toBeInstanceOf(SwitchUnconfirmedError);

    expect(calls).toHaveLength(2);
    expect(storage()).toBe(before);
    expect(useAuthStore.getState()).toMatchObject({ accessToken: "A1", user: USER });
  });

  it("a 200 without tokens is ambiguous too (the BE rotated, nothing usable arrived)", async () => {
    const { switching } = run([{ status: 200, body: {} }, { status: 200, body: {} }]);

    await expect(switching()).rejects.toBeInstanceOf(SwitchUnconfirmedError);
  });
});

describe("switchProfile: after the commit", () => {
  it("a failing GET me changes nothing: tokens and the summary-derived user stay consistent", async () => {
    const { switching } = run([switchedOk]);

    await switching();
    await tick();

    expect(useAuthStore.getState()).toMatchObject({ accessToken: "A2", user: { id: "p-alt", username: "alt_user" } });
  });

  it("a successful GET me refreshes the snapshot", async () => {
    const me = { email: "real@ysocial.dev", profile: { id: "p-alt", username: "alt_user", displayName: "Alt User", bio: "fresh bio", avatarUrl: null } };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(me), { status: 200, headers: { "content-type": "application/json" } })));
    const { switching } = run([switchedOk]);

    await switching();
    await vi.waitFor(() => expect(useAuthStore.getState().user?.bio).toBe("fresh bio"));
  });

  it("a GET me that answers for a profile the viewer already left is ignored", async () => {
    const me = { email: "real@ysocial.dev", profile: { id: "someone-else", username: "x", displayName: "X" } };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(me), { status: 200, headers: { "content-type": "application/json" } })));
    const { switching } = run([switchedOk]);

    await switching();
    await tick();

    expect(useAuthStore.getState().user?.id).toBe("p-alt");
  });
});

describe("switchProfile: concurrency", () => {
  it("a refresh holding the lock first: the switch adopts its pair, exactly 1 rotation, no 401", async () => {
    const { fetchFn, calls } = mockFetchSequence([rotatedOk, switchedOk]);

    const refresh = tokenRefresh.refreshTokens("A1", { locks, fetchFn });
    const switched = authService.switchProfile(TARGET, { locks, fetchFn });
    await Promise.all([refresh, switched]);

    expect(calls.filter((call) => call.url === REFRESH_URL)).toHaveLength(1);
    expect(authOf(calls[1])).toBe("Bearer AR");
    expect(bodyOf(calls[1]).refreshToken).toBe("RR");
  });

  it("a second switch while one is pending is refused without a request", async () => {
    const { open, opened } = gate();
    const slow = mockFetchSequence([switchedOk]);
    const fetchFn = (async (...args: Parameters<typeof fetch>) => {
      await opened;
      return slow.fetchFn(...args);
    }) as typeof fetch;

    const first = authService.switchProfile(TARGET, { locks, fetchFn });
    await expect(authService.switchProfile(TARGET, { locks, fetchFn })).rejects.toBeInstanceOf(SwitchInProgressError);
    open();
    await first;

    expect(slow.calls).toHaveLength(1);
  });

  it("without navigator.locks the switch & an in-tab refresh serialize through the shared chain", async () => {
    const { open, opened } = gate();
    const slow = mockFetchSequence([switchedOk]);
    const switchFetch = (async (...args: Parameters<typeof fetch>) => {
      await opened;
      return slow.fetchFn(...args);
    }) as typeof fetch;
    const refreshFetch = mockFetchSequence([]);

    const switched = authService.switchProfile(TARGET, { locks: null, fetchFn: switchFetch });
    const refresh = tokenRefresh.refreshTokens("A1", { locks: null, fetchFn: refreshFetch.fetchFn });
    await tick();
    expect(refreshFetch.calls).toHaveLength(0);

    open();
    await switched;

    expect(await refresh).toMatchObject({ status: "adopted", accessToken: "A2" });
    expect(refreshFetch.calls).toHaveLength(0);
  });
});

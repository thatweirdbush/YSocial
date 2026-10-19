import { beforeEach, describe, expect, it } from "vitest";
import { AUTH_STORAGE_KEYS } from "@/features/auth/store/auth-store";
import { createLockFake, mockFetchSequence, problem } from "@/test/api-test-utils";
import { API_BASE_URL } from "./api-config";
import { getRefreshCoordination, refreshTokens } from "./token-refresh";

const seed = (access: string | null, refresh: string | null) => {
  localStorage.clear();
  if (access) localStorage.setItem(AUTH_STORAGE_KEYS.access, access);
  if (refresh) localStorage.setItem(AUTH_STORAGE_KEYS.refresh, refresh);
};
const stored = () => ({
  access: localStorage.getItem(AUTH_STORAGE_KEYS.access),
  refresh: localStorage.getItem(AUTH_STORAGE_KEYS.refresh),
});
const rotated = { status: 200, body: { accessToken: "A2", refreshToken: "R2" } };

beforeEach(() => seed("A1", "R1"));

describe("refreshTokens with locks", () => {
  it("2 concurrent calls, same sent token -> exactly 1 fetch, second adopted", async () => {
    const { fetchFn, calls } = mockFetchSequence([rotated]);
    const locks = createLockFake();
    const [first, second] = await Promise.all([
      refreshTokens("A1", { locks, fetchFn }),
      refreshTokens("A1", { locks, fetchFn }),
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${API_BASE_URL}/api/identities/refresh-token`);
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ refreshToken: "R1" });
    expect(first).toMatchObject({ status: "refreshed", accessToken: "A2" });
    expect(second).toMatchObject({ status: "adopted", accessToken: "A2" });
  });

  it("stored access token already rotated -> adopted without fetch", async () => {
    seed("A5", "R5");
    const { fetchFn, calls } = mockFetchSequence([]);
    const outcome = await refreshTokens("A1", { locks: createLockFake(), fetchFn });
    expect(outcome).toMatchObject({ status: "adopted", accessToken: "A5" });
    expect(calls).toHaveLength(0);
  });

  it("401 InvalidRefreshToken but stored refresh token changed meanwhile -> adopted", async () => {
    const { fetchFn: inner } = mockFetchSequence([problem(401, "InvalidRefreshToken")]);
    const fetchFn = (async (...args: Parameters<typeof fetch>) => {
      localStorage.setItem(AUTH_STORAGE_KEYS.access, "A9");
      localStorage.setItem(AUTH_STORAGE_KEYS.refresh, "R9");
      return inner(...args);
    }) as typeof fetch;
    const outcome = await refreshTokens("A1", { locks: createLockFake(), fetchFn });
    expect(outcome).toMatchObject({ status: "adopted", accessToken: "A9" });
  });

  it("401 InvalidRefreshToken with unchanged stored token -> unauthorized (BE restart)", async () => {
    const { fetchFn } = mockFetchSequence([problem(401, "InvalidRefreshToken")]);
    const outcome = await refreshTokens("A1", { locks: createLockFake(), fetchFn });
    expect(outcome).toEqual({ status: "unauthorized" });
  });

  it("no refresh token -> unauthorized without fetch", async () => {
    seed("A1", null);
    const { fetchFn, calls } = mockFetchSequence([]);
    expect(await refreshTokens("A1", { locks: createLockFake(), fetchFn })).toEqual({ status: "unauthorized" });
    expect(calls).toHaveLength(0);
  });

  it("network error -> transient, tokens untouched", async () => {
    const { fetchFn } = mockFetchSequence([{ status: 0, reject: new TypeError("Failed to fetch") }]);
    const outcome = await refreshTokens("A1", { locks: createLockFake(), fetchFn });
    expect(outcome.status).toBe("transient");
    if (outcome.status === "transient") expect(outcome.error.kind).toBe("network");
    expect(stored()).toEqual({ access: "A1", refresh: "R1" });
  });

  it("refresh fetch is bounded by a timeout signal", async () => {
    const { fetchFn, calls } = mockFetchSequence([problem(500, "InternalError")]);
    await refreshTokens("A1", { locks: createLockFake(), fetchFn });
    expect(calls[0].init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("500 -> transient", async () => {
    const { fetchFn } = mockFetchSequence([problem(500, "InternalError")]);
    const outcome = await refreshTokens("A1", { locks: createLockFake(), fetchFn });
    expect(outcome.status).toBe("transient");
    expect(stored()).toEqual({ access: "A1", refresh: "R1" });
  });

  it("success writes both tokens", async () => {
    const { fetchFn } = mockFetchSequence([rotated]);
    const outcome = await refreshTokens("A1", { locks: createLockFake(), fetchFn });
    expect(outcome).toEqual({ status: "refreshed", accessToken: "A2", refreshToken: "R2" });
    expect(stored()).toEqual({ access: "A2", refresh: "R2" });
  });
});

describe("refreshTokens without locks", () => {
  it('coordination is "in-tab", same-tab concurrent calls still 1 fetch', async () => {
    const { fetchFn, calls } = mockFetchSequence([rotated]);
    const deps = { locks: null, fetchFn };
    expect(getRefreshCoordination(deps)).toBe("in-tab");
    const [first, second] = await Promise.all([refreshTokens("A1", deps), refreshTokens("A1", deps)]);
    expect(calls).toHaveLength(1);
    expect(first.status).toBe("refreshed");
    expect(second.status).toBe("refreshed");
  });

  it("cross-tab loser recovers via 401 rescue (not claimed as single-flight)", async () => {
    const { fetchFn: inner } = mockFetchSequence([problem(401, "InvalidRefreshToken")]);
    const fetchFn = (async (...args: Parameters<typeof fetch>) => {
      localStorage.setItem(AUTH_STORAGE_KEYS.access, "A7");
      localStorage.setItem(AUTH_STORAGE_KEYS.refresh, "R7");
      return inner(...args);
    }) as typeof fetch;
    const outcome = await refreshTokens("A1", { locks: null, fetchFn });
    expect(outcome).toMatchObject({ status: "adopted", accessToken: "A7" });
  });
});

describe("getRefreshCoordination", () => {
  it("reflects lock availability", () => {
    expect(getRefreshCoordination({ locks: createLockFake() })).toBe("cross-tab");
    expect(getRefreshCoordination({ locks: null })).toBe("in-tab");
  });
});

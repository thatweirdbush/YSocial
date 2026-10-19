import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth/store/auth-store";
import { mockFetchSequence, problem, type MockStep } from "@/test/api-test-utils";
import { apiClient, apiFetch, authRedirect } from "./api-client";
import { API_BASE_URL } from "./api-config";
import { ApiError } from "./api-error";
import { refreshTokens, type RefreshOutcome } from "./token-refresh";

vi.mock("./token-refresh", () => ({ refreshTokens: vi.fn() }));
const refresh = vi.mocked(refreshTokens);

function useFetch(steps: MockStep[]) {
  const fake = mockFetchSequence(steps);
  vi.stubGlobal("fetch", fake.fetchFn);
  return fake.calls;
}
const authHeader = (call: { init?: RequestInit }) => new Headers(call.init?.headers).get("Authorization");

beforeEach(() => {
  localStorage.clear();
  useAuthStore.getState().actions.clearAuth();
  useAuthStore.getState().actions.setTokens("A1", "R1");
  refresh.mockReset();
  vi.spyOn(authRedirect, "toLogin").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("apiFetch basics", () => {
  it("adds Bearer header when token present", async () => {
    const calls = useFetch([{ status: 200, body: { ok: true } }]);
    expect(await apiFetch("/api/users/me")).toEqual({ ok: true });
    expect(calls[0].url).toBe(`${API_BASE_URL}/api/users/me`);
    expect(authHeader(calls[0])).toBe("Bearer A1");
  });

  it("no Authorization header for guests", async () => {
    useAuthStore.getState().actions.clearAuth();
    const calls = useFetch([{ status: 200, body: {} }]);
    await apiFetch("/api/feed");
    expect(authHeader(calls[0])).toBeNull();
  });

  it("204 returns undefined", async () => {
    useFetch([{ status: 204 }]);
    expect(await apiFetch("/api/x", { method: "DELETE" })).toBeUndefined();
  });

  it("JSON is returned as-is (no key mapping)", async () => {
    useFetch([{ status: 200, body: { AccessToken: "x", nested: { PascalKey: 1 } } }]);
    expect(await apiFetch("/api/x")).toEqual({ AccessToken: "x", nested: { PascalKey: 1 } });
  });

  it("non-ok -> ApiError with code", async () => {
    useFetch([problem(409, "EmailTaken")]);
    await expect(apiFetch("/api/x")).rejects.toMatchObject({ kind: "http", status: 409, code: "EmailTaken" });
  });

  it("fetch rejects -> ApiError kind network", async () => {
    useFetch([{ status: 0, reject: new TypeError("Failed to fetch") }]);
    const error = await apiFetch("/api/x").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: "network", code: "Network" });
  });

  it("HTML error body -> ApiError code Unknown", async () => {
    useFetch([{ status: 502, body: "<html>bad gateway</html>", headers: { "content-type": "text/html" } }]);
    await expect(apiFetch("/api/x")).rejects.toMatchObject({ kind: "http", status: 502, code: "Unknown" });
  });

  it("params serialized, undefined skipped", async () => {
    const calls = useFetch([{ status: 200, body: {} }]);
    await apiFetch("/api/feed", { params: { tab: "forYou", page: 2, q: undefined, flag: false } });
    expect(calls[0].url).toBe(`${API_BASE_URL}/api/feed?tab=forYou&page=2&flag=false`);
  });

  it("apiClient.post sends JSON body", async () => {
    const calls = useFetch([{ status: 201, body: { id: "1" } }]);
    await apiClient.post("/api/posts", { content: "hi" });
    expect(calls[0].init?.method).toBe("POST");
    expect(calls[0].init?.body).toBe(JSON.stringify({ content: "hi" }));
    expect(new Headers(calls[0].init?.headers).get("Content-Type")).toBe("application/json");
  });
});

describe("401 interceptor", () => {
  it("401 then refreshed -> original retried once with new token", async () => {
    const calls = useFetch([problem(401, "Unauthenticated"), { status: 200, body: { ok: 1 } }]);
    refresh.mockResolvedValue({ status: "refreshed", accessToken: "A2", refreshToken: "R2" });
    expect(await apiFetch("/api/users/me")).toEqual({ ok: 1 });
    expect(refresh).toHaveBeenCalledWith("A1");
    expect(calls).toHaveLength(2);
    expect(authHeader(calls[1])).toBe("Bearer A2");
    expect(useAuthStore.getState().accessToken).toBe("A2");
    expect(useAuthStore.getState().refreshToken).toBe("R2");
  });

  it("401 then adopted -> retried with adopted token", async () => {
    const calls = useFetch([problem(401, "Unauthenticated"), { status: 200, body: {} }]);
    refresh.mockResolvedValue({ status: "adopted", accessToken: "A9", refreshToken: "R9" });
    await apiFetch("/api/users/me");
    expect(authHeader(calls[1])).toBe("Bearer A9");
  });

  it("401 then retry 401 -> rejects, no 2nd refresh", async () => {
    useFetch([problem(401, "Unauthenticated"), problem(401, "Unauthenticated")]);
    refresh.mockResolvedValue({ status: "refreshed", accessToken: "A2", refreshToken: "R2" });
    await expect(apiFetch("/api/users/me")).rejects.toMatchObject({ status: 401 });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("login 401 with skipAuthRefresh -> no refresh call", async () => {
    useFetch([problem(401, "InvalidCredentials")]);
    await expect(apiFetch("/api/identities/login", { method: "POST", skipAuthRefresh: true })).rejects.toMatchObject({
      code: "InvalidCredentials",
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("auth calls (skipAuthRefresh) carry no Bearer & a timeout signal", async () => {
    const calls = useFetch([{ status: 204 }]);
    await apiFetch("/api/identities/logout", { method: "POST", skipAuthRefresh: true });
    expect(authHeader(calls[0])).toBeNull();
    expect(calls[0].init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("refresh unauthorized -> clearAuth & redirect /login, original 401 thrown", async () => {
    useFetch([problem(401, "Unauthenticated")]);
    refresh.mockResolvedValue({ status: "unauthorized" } satisfies RefreshOutcome);
    await expect(apiFetch("/api/users/me")).rejects.toMatchObject({ status: 401, code: "Unauthenticated" });
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(authRedirect.toLogin).toHaveBeenCalled();
  });

  it("refresh unauthorized but another tab already stored new tokens -> adopt & retry, never clear", async () => {
    const calls = useFetch([problem(401, "Unauthenticated"), { status: 200, body: { ok: 1 } }]);
    refresh.mockImplementation(async () => {
      localStorage.setItem("ysocial_access_token", "A9");
      localStorage.setItem("ysocial_refresh_token", "R9");
      return { status: "unauthorized" };
    });
    expect(await apiFetch("/api/users/me")).toEqual({ ok: 1 });
    expect(authHeader(calls[1])).toBe("Bearer A9");
    expect(useAuthStore.getState().refreshToken).toBe("R9");
    expect(authRedirect.toLogin).not.toHaveBeenCalled();
  });

  it("guest 401 -> original error, no clearAuth, no redirect", async () => {
    useAuthStore.getState().actions.clearAuth();
    useFetch([problem(401, "Unauthenticated")]);
    refresh.mockResolvedValue({ status: "unauthorized" });
    await expect(apiFetch("/api/feed")).rejects.toMatchObject({ status: 401 });
    expect(authRedirect.toLogin).not.toHaveBeenCalled();
  });

  it("refresh transient -> session kept, ApiError thrown", async () => {
    useFetch([problem(401, "Unauthenticated")]);
    const error = new ApiError({ kind: "network", status: 0, code: "Network" });
    refresh.mockResolvedValue({ status: "transient", error });
    await expect(apiFetch("/api/users/me")).rejects.toBe(error);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(authRedirect.toLogin).not.toHaveBeenCalled();
  });
});

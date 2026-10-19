import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL } from "@/lib/api-config";
import { mockFetchSequence, problem, setRealSlices, type MockStep } from "@/test/api-test-utils";
import { SEED_DEMO_ACCOUNT } from "@/mocks/seed-authors";
import { useAuthStore } from "../store/auth-store";
import { getRegisterSchema, type MeDto } from "../types";
import { authService, RegisteredLoginFailedError, toAuthUser } from "./auth-service";

const PROFILE_ID = "0b8f1c52-6a3e-4c53-9b42-5f9d6f7a1e10";
const me: MeDto = {
  email: "real@ysocial.dev",
  profile: { id: PROFILE_ID, username: "real_user", displayName: "Real User", bio: null, avatarUrl: null } as MeDto["profile"],
};
const loginOk: MockStep = { status: 200, body: { accessToken: "A1", refreshToken: "R1", refreshTokenExpiry: "2030-01-01T00:00:00Z" } };
const meOk: MockStep = { status: 200, body: me };

function useFetch(steps: MockStep[]) {
  const fake = mockFetchSequence(steps);
  vi.stubGlobal("fetch", fake.fetchFn);
  return fake.calls;
}
const body = (call: { init?: RequestInit }) => JSON.parse(String(call.init?.body));
const path = (call: { url: string }) => call.url.replace(API_BASE_URL, "");

beforeEach(() => {
  localStorage.clear();
  useAuthStore.getState().actions.clearAuth();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("toAuthUser", () => {
  it("maps nulls to undefined", () => {
    expect(toAuthUser(me)).toEqual({
      id: PROFILE_ID,
      email: "real@ysocial.dev",
      displayName: "Real User",
      username: "real_user",
      bio: undefined,
      avatarUrl: undefined,
    });
  });
});

describe("real adapter", () => {
  beforeEach(() => setRealSlices("auth"));

  it("login sends loginId/password/deviceId with skipAuthRefresh (no refresh on 401)", async () => {
    const calls = useFetch([problem(401, "InvalidCredentials")]);
    await expect(authService.login("real@ysocial.dev", "pw")).rejects.toMatchObject({ code: "InvalidCredentials" });
    expect(calls).toHaveLength(1);
    expect(path(calls[0])).toBe("/api/identities/login");
    expect(body(calls[0])).toMatchObject({ loginId: "real@ysocial.dev", password: "pw" });
    expect(body(calls[0]).deviceId).toBeTruthy();
  });

  it("login stores tokens then bootstraps viewer from /me", async () => {
    const calls = useFetch([loginOk, meOk]);
    const user = await authService.login("real_user", "pw");
    expect(path(calls[1])).toBe("/api/users/me");
    expect(new Headers(calls[1].init?.headers).get("Authorization")).toBe("Bearer A1");
    expect(user.id).toBe(PROFILE_ID);
    const state = useAuthStore.getState();
    expect([state.accessToken, state.refreshToken, state.isAuthenticated]).toEqual(["A1", "R1", true]);
    expect(state.user?.username).toBe("real_user");
  });

  it("login: /me failure clears auth", async () => {
    useFetch([loginOk, problem(500, "InternalError")]);
    await expect(authService.login("real_user", "pw")).rejects.toMatchObject({ status: 500 });
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(localStorage.getItem("ysocial_access_token")).toBeNull();
  });

  it("register then login", async () => {
    const calls = useFetch([{ status: 201, body: { accountId: "acc" } }, loginOk, meOk]);
    await authService.register({ email: "real@ysocial.dev", password: "pw", username: "real_user" });
    expect(path(calls[0])).toBe("/api/identities/register");
    expect(body(calls[0])).toMatchObject({ email: "real@ysocial.dev", username: "real_user" });
    expect(body(calls[1])).toMatchObject({ loginId: "real@ysocial.dev" });
    expect(useAuthStore.getState().user?.id).toBe(PROFILE_ID);
  });

  it("register 409 UsernameTaken surfaces ApiError, no login", async () => {
    const calls = useFetch([problem(409, "UsernameTaken")]);
    await expect(authService.register({ email: "a@b.co", password: "pw", username: "dup" })).rejects.toMatchObject({
      code: "UsernameTaken",
    });
    expect(calls).toHaveLength(1);
  });

  it("register ok but login fails -> RegisteredLoginFailedError", async () => {
    useFetch([{ status: 201, body: { accountId: "acc" } }, problem(500, "InternalError")]);
    await expect(authService.register({ email: "a@b.co", password: "pw", username: "u" })).rejects.toBeInstanceOf(
      RegisteredLoginFailedError,
    );
  });

  it("logout with network failure still clears local session", async () => {
    useAuthStore.getState().actions.setTokens("A1", "R1");
    const calls = useFetch([{ status: 0, reject: new TypeError("Failed to fetch") }]);
    await authService.logout();
    expect(body(calls[0])).toEqual({ refreshToken: "R1" });
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(localStorage.getItem("ysocial_refresh_token")).toBeNull();
  });

  it("forgot/reset call endpoints, 204 -> void", async () => {
    const calls = useFetch([{ status: 204 }, { status: 204 }]);
    await expect(authService.forgotPassword("real@ysocial.dev")).resolves.toBeUndefined();
    await expect(
      authService.resetPassword({ loginId: "real@ysocial.dev", otp: "123456", newPassword: "newpw1" }),
    ).resolves.toBeUndefined();
    expect(path(calls[0])).toBe("/api/identities/forgot-password");
    expect(body(calls[0])).toEqual({ loginId: "real@ysocial.dev" });
    expect(path(calls[1])).toBe("/api/identities/reset-password");
    expect(body(calls[1])).toEqual({ loginId: "real@ysocial.dev", otp: "123456", newPassword: "newpw1" });
  });

  it("real mode does not apply reserved-username rule", () => {
    const schema = getRegisterSchema((key) => key);
    const result = schema.safeParse({
      email: "a@b.co",
      username: SEED_DEMO_ACCOUNT.username,
      password: "secret1",
      confirmPassword: "secret1",
    });
    expect(result.success).toBe(true);
  });
});

describe("mock adapter", () => {
  it("keeps seed demo login", async () => {
    vi.useFakeTimers();
    const pending = authService.login("someone@else.com", "secret1");
    await vi.advanceTimersByTimeAsync(1500);
    const user = await pending;
    expect(user).toMatchObject({ id: SEED_DEMO_ACCOUNT.id, username: SEED_DEMO_ACCOUNT.username });
    expect(useAuthStore.getState().accessToken).toBe("mock_access_token");
  });

  it("mock register signs in the new account", async () => {
    vi.useFakeTimers();
    const pending = authService.register({ email: "n@e.co", password: "secret1", username: "NewOne" });
    await vi.advanceTimersByTimeAsync(1600);
    await pending;
    expect(useAuthStore.getState().user).toMatchObject({ email: "n@e.co", username: "newone" });
  });

  it("mock mode keeps reserved-username rule", () => {
    const schema = getRegisterSchema((key) => key);
    const result = schema.safeParse({
      email: "a@b.co",
      username: SEED_DEMO_ACCOUNT.username,
      password: "secret1",
      confirmPassword: "secret1",
    });
    expect(result.success).toBe(false);
  });

  it("mock logout clears auth", async () => {
    useAuthStore.getState().actions.setTokens("mock_access_token", "mock_refresh_token");
    await authService.logout();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});

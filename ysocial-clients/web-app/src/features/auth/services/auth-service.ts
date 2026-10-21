import { apiClient } from "@/lib/api-client";
import { isRealApi } from "@/lib/api-config";
import { ApiError } from "@/lib/api-error";
import { SEED_DEMO_ACCOUNT } from "@/mocks/seed-authors";
import { useAuthStore } from "../store/auth-store";
import type { AuthUser, LoginResponse, MeDto, RegisterInput, ResetPasswordInput } from "../types";
import { getDeviceId } from "../utils/device-id";

/** Register succeeded but the automatic login did not: caller sends the user to the login page. */
export class RegisteredLoginFailedError extends Error {
  constructor(cause: unknown) {
    super("Account created but automatic login failed", { cause });
    this.name = "RegisteredLoginFailedError";
  }
}

interface AuthAdapter {
  register(input: RegisterInput): Promise<void>;
  login(loginId: string, password: string): Promise<AuthUser>;
  logout(): Promise<void>;
  forgotPassword(loginId: string): Promise<void>;
  resetPassword(input: ResetPasswordInput): Promise<void>;
}

const AUTH_CALL = { skipAuthRefresh: true } as const;
const actions = () => useAuthStore.getState().actions;
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** `GET /api/users/me`: active profile, email, switcher list & owner-only demographics. Real BE only. */
export const fetchMe = (): Promise<MeDto> => apiClient.get<MeDto>("/api/users/me");

/** `MeDto` (profile + email) -> persisted viewer snapshot; nullable DTO fields become `undefined`. */
export function toAuthUser(me: MeDto): AuthUser {
  const profile = me.profile;
  if (!profile?.id) {
    throw new ApiError({ kind: "http", status: 200, code: "Unknown", detail: "Malformed /api/users/me response" });
  }
  return {
    id: profile.id,
    email: me.email ?? "",
    displayName: profile.displayName ?? undefined,
    username: profile.username ?? undefined,
    bio: profile.bio ?? undefined,
    avatarUrl: profile.avatarUrl ?? undefined,
  };
}

// #region Mock adapter (today's inline behavior: seed demo account, `mock_*` tokens)
const mockAdapter: AuthAdapter = {
  async register(input) {
    await delay(1500);
    actions().setTokens("mock_access_token", "mock_refresh_token");
    actions().updateUser({
      id: "2",
      email: input.email,
      displayName: input.username,
      username: input.username.toLowerCase(),
      bio: "Just joined the YSocial ecosystem!",
    });
  },
  async login() {
    await delay(1200);
    actions().setTokens("mock_access_token", "mock_refresh_token");
    // Mock login always signs in the seed demo account (spec D10); the typed identity is only validated by the form.
    const user: AuthUser = {
      id: SEED_DEMO_ACCOUNT.id,
      email: "member@ysocial.dev",
      displayName: SEED_DEMO_ACCOUNT.displayName,
      username: SEED_DEMO_ACCOUNT.username,
      avatarUrl: SEED_DEMO_ACCOUNT.avatarUrl,
      bio: "Joined YSocial Premium Social Ecosystem",
    };
    actions().updateUser(user);
    return user;
  },
  async logout() {
    actions().clearAuth();
  },
  async forgotPassword() {
    await delay(1000);
  },
  async resetPassword() {
    await delay(1500);
  },
};
// #endregion

// #region Real adapter (MAP §1, F-D8)
async function realLogin(loginId: string, password: string): Promise<AuthUser> {
  const tokens = await apiClient.post<LoginResponse>(
    "/api/identities/login",
    { loginId, password, deviceId: getDeviceId() },
    AUTH_CALL,
  );
  if (!tokens?.accessToken || !tokens.refreshToken) {
    throw new ApiError({ kind: "http", status: 200, code: "Unknown", detail: "Malformed login response" });
  }
  actions().setTokens(tokens.accessToken, tokens.refreshToken);
  try {
    const user = toAuthUser(await fetchMe());
    actions().updateUser(user);
    return user;
  } catch (error) {
    actions().clearAuth();
    throw error;
  }
}

const realAdapter: AuthAdapter = {
  async register(input) {
    await apiClient.post(
      "/api/identities/register",
      { email: input.email, password: input.password, username: input.username, phoneNumber: input.phoneNumber },
      AUTH_CALL,
    );
    try {
      await realLogin(input.email, input.password);
    } catch (error) {
      throw new RegisteredLoginFailedError(error);
    }
  },
  login: realLogin,
  async logout() {
    const refreshToken = useAuthStore.getState().refreshToken;
    try {
      if (refreshToken) await apiClient.post("/api/identities/logout", { refreshToken }, AUTH_CALL);
    } catch {
      // Best-effort: BE always answers 204; local session ends regardless
    } finally {
      actions().clearAuth();
    }
  },
  async forgotPassword(loginId) {
    await apiClient.post("/api/identities/forgot-password", { loginId }, AUTH_CALL);
  },
  async resetPassword(input) {
    await apiClient.post("/api/identities/reset-password", input, AUTH_CALL);
  },
};
// #endregion

const adapter = (): AuthAdapter => (isRealApi("auth") ? realAdapter : mockAdapter);

/** Auth operations; the adapter (mock or real BE) is picked per call by `isRealApi("auth")`. */
export const authService: AuthAdapter = {
  register: (input) => adapter().register(input),
  login: (loginId, password) => adapter().login(loginId, password),
  logout: () => adapter().logout(),
  forgotPassword: (loginId) => adapter().forgotPassword(loginId),
  resetPassword: (input) => adapter().resetPassword(input),
};

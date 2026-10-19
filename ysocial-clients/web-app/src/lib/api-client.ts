import { AUTH_STORAGE_KEYS, useAuthStore } from "@/features/auth/store/auth-store";
import { API_BASE_URL } from "./api-config";
import { networkError, parseProblem } from "./api-error";
import { refreshTokens } from "./token-refresh";

export interface ApiRequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
  /** Auth endpoints (register, login, refresh-token, logout, forgot/reset-password): never refresh on 401. */
  skipAuthRefresh?: boolean;
}

const AUTH_CALL_TIMEOUT_MS = 15_000;

/** Navigation side effects, isolated so tests can observe them. */
export const authRedirect = {
  toLogin: () => {
    if (typeof window !== "undefined") window.location.assign("/login");
  },
};

function buildUrl(path: string, params?: ApiRequestOptions["params"]): string {
  const url = `${API_BASE_URL}${path}`;
  if (!params) return url;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.append(key, String(value));
  }
  const query = search.toString();
  return query ? `${url}?${query}` : url;
}

async function send(url: string, options: ApiRequestOptions, accessToken: string | null): Promise<Response> {
  const init: ApiRequestOptions = { ...options };
  // Auth endpoints are anonymous (identity travels in the body): no Bearer, and a bounded wait so a hung call cannot stall login/logout
  const isAuthCall = Boolean(options.skipAuthRefresh);
  if (isAuthCall && !init.signal) init.signal = AbortSignal.timeout(AUTH_CALL_TIMEOUT_MS);
  delete init.params;
  delete init.skipAuthRefresh;
  const headers = new Headers(init.headers);
  if (accessToken && !isAuthCall) headers.set("Authorization", `Bearer ${accessToken}`);
  if (init.body && !headers.has("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  try {
    return await fetch(url, { ...init, headers });
  } catch (cause) {
    throw networkError(cause);
  }
}

async function readBody<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}

/** Typed BE call: JSON as-is, failures as `ApiError`, silent token refresh on 401 (retry once, never loops). */
export async function apiFetch<T = unknown>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const url = buildUrl(path, options.params);
  const { actions } = useAuthStore.getState();
  const sentToken = useAuthStore.getState().accessToken;

  let response = await send(url, options, sentToken);

  if (response.status === 401 && !options.skipAuthRefresh) {
    const original = await parseProblem(response);
    const outcome = await refreshTokens(sentToken);
    if (outcome.status === "transient") throw outcome.error;
    let tokens: { accessToken: string; refreshToken: string } | null =
      outcome.status === "unauthorized" ? null : outcome;
    if (!tokens) {
      // Another tab may have rotated meanwhile (storage already holds a different pair): adopt, never clear it
      const storedRefresh = localStorage.getItem(AUTH_STORAGE_KEYS.refresh);
      const storedAccess = localStorage.getItem(AUTH_STORAGE_KEYS.access);
      if (storedAccess && storedRefresh && storedRefresh !== useAuthStore.getState().refreshToken) {
        tokens = { accessToken: storedAccess, refreshToken: storedRefresh };
      }
    }
    if (!tokens) {
      // A guest 401 is just an unauthorized call, not an expired session
      if (sentToken) {
        actions.clearAuth();
        authRedirect.toLogin();
      }
      throw original;
    }
    actions.setTokens(tokens.accessToken, tokens.refreshToken);
    response = await send(url, options, tokens.accessToken);
  }

  if (!response.ok) throw await parseProblem(response);
  return readBody<T>(response);
}

const withBody = (body: unknown): Pick<RequestInit, "body"> => ({
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const apiClient = {
  get: <T = unknown>(path: string, options?: Omit<ApiRequestOptions, "method">) =>
    apiFetch<T>(path, { ...options, method: "GET" }),
  post: <T = unknown>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, "method" | "body">) =>
    apiFetch<T>(path, { ...options, method: "POST", ...withBody(body) }),
  put: <T = unknown>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, "method" | "body">) =>
    apiFetch<T>(path, { ...options, method: "PUT", ...withBody(body) }),
  patch: <T = unknown>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, "method" | "body">) =>
    apiFetch<T>(path, { ...options, method: "PATCH", ...withBody(body) }),
  delete: <T = unknown>(path: string, options?: Omit<ApiRequestOptions, "method">) =>
    apiFetch<T>(path, { ...options, method: "DELETE" }),
};

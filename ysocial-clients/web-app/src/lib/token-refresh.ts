import { AUTH_STORAGE_KEYS } from "@/features/auth/store/auth-store";
import { API_BASE_URL } from "./api-config";
import { type ApiError, hasCode, isApiError, networkError, parseProblem } from "./api-error";

export interface LockManagerLike {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

export type RefreshOutcome =
  | { status: "refreshed" | "adopted"; accessToken: string; refreshToken: string }
  | { status: "unauthorized" }
  | { status: "transient"; error: ApiError };

interface RefreshDeps {
  /** `null` forces in-tab coordination; omitted = `navigator.locks` when present. */
  locks?: LockManagerLike | null;
  storage?: Storage;
  fetchFn?: typeof fetch;
}

const LOCK_NAME = "ysocial-refresh";

/** Auth endpoint path (MAP §1). */
const REFRESH_PATH = "/api/identities/refresh-token";

const resolveLocks = (deps?: RefreshDeps): LockManagerLike | null => {
  if (deps && deps.locks !== undefined) return deps.locks;
  if (typeof navigator !== "undefined" && navigator.locks) return navigator.locks as unknown as LockManagerLike;
  return null;
};

/** `cross-tab` only when a lock manager exists (secure contexts); otherwise races are mitigated, not prevented. */
export function getRefreshCoordination(deps?: RefreshDeps): "cross-tab" | "in-tab" {
  return resolveLocks(deps) ? "cross-tab" : "in-tab";
}

let inTabFlight: Promise<RefreshOutcome> | null = null;

/**
 * Rotates the token pair once per rotation: inside the lock the stored tokens are re-read, so a caller whose sent
 * access token is stale adopts what another tab already stored. 401 `InvalidRefreshToken` ends the session only
 * when the stored refresh token is unchanged (F-D6, F-D7).
 */
export async function refreshTokens(sentAccessToken: string | null, deps?: RefreshDeps): Promise<RefreshOutcome> {
  const locks = resolveLocks(deps);
  if (locks) return locks.request(LOCK_NAME, () => rotate(sentAccessToken, deps));
  if (!inTabFlight) {
    inTabFlight = rotate(sentAccessToken, deps).finally(() => {
      inTabFlight = null;
    });
  }
  return inTabFlight;
}

async function rotate(sentAccessToken: string | null, deps?: RefreshDeps): Promise<RefreshOutcome> {
  const storage = deps?.storage ?? localStorage;
  const fetchFn = deps?.fetchFn ?? fetch;

  const storedAccess = storage.getItem(AUTH_STORAGE_KEYS.access);
  const storedRefresh = storage.getItem(AUTH_STORAGE_KEYS.refresh);
  if (storedAccess && storedRefresh && storedAccess !== sentAccessToken) {
    return { status: "adopted", accessToken: storedAccess, refreshToken: storedRefresh };
  }
  if (!storedRefresh) return { status: "unauthorized" };

  let response: Response;
  try {
    response = await fetchFn(`${API_BASE_URL}${REFRESH_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: storedRefresh }),
    });
  } catch (cause) {
    return { status: "transient", error: networkError(cause) };
  }

  if (response.ok) {
    try {
      const data = (await response.json()) as { accessToken?: string; refreshToken?: string };
      if (!data.accessToken || !data.refreshToken) throw new Error("Malformed refresh response");
      storage.setItem(AUTH_STORAGE_KEYS.access, data.accessToken);
      storage.setItem(AUTH_STORAGE_KEYS.refresh, data.refreshToken);
      return { status: "refreshed", accessToken: data.accessToken, refreshToken: data.refreshToken };
    } catch (cause) {
      return { status: "transient", error: networkError(cause) };
    }
  }

  const error = await parseProblem(response);
  if (response.status === 401 && hasCode(error, "InvalidRefreshToken")) {
    const nowAccess = storage.getItem(AUTH_STORAGE_KEYS.access);
    const nowRefresh = storage.getItem(AUTH_STORAGE_KEYS.refresh);
    if (nowAccess && nowRefresh && nowRefresh !== storedRefresh) {
      return { status: "adopted", accessToken: nowAccess, refreshToken: nowRefresh };
    }
    return { status: "unauthorized" };
  }
  return { status: "transient", error: isApiError(error) ? error : networkError(error) };
}

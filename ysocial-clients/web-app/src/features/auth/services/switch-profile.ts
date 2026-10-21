import { API_BASE_URL } from "@/lib/api-config";
import { type ApiError, hasCode, isApiError, networkError, parseProblem } from "@/lib/api-error";
import { type RefreshDeps, rotateTokens, withRefreshLock } from "@/lib/token-refresh";
import { AUTH_STORAGE_KEYS, useAuthStore } from "../store/auth-store";
import type { AuthUser, ProfileSummary } from "../types";

// Real-BE profile switch (roadmap 2.7). It holds the cross-tab refresh lock for its whole run, so it may use NEITHER
// `apiClient` NOR `refreshTokens` (a 401 there refreshes through the same non-re-entrant lock and would hang):
// raw `fetch` + the unlocked `rotateTokens` only.
//
// `PUT profiles/switch` is NOT idempotent but AT-MOST-ONCE: it consumes the single-use refresh token, so a replay is
// a 401 `InvalidRefreshToken`, never a second switch. What a lost response cannot give is exactly-once: the new
// tokens exist only in that response, so a switch that committed but was never received ends as "session lost".

const SWITCH_PATH = "/api/users/profiles/switch";

/** A hung PUT would stall every refresh waiting on the lock: abort = ambiguous failure. */
const SWITCH_TIMEOUT_MS = 15_000;

/** The refresh token is dead & the new one never arrived: the session is over, sign in again. */
export class SwitchSessionLostError extends Error {
  constructor() {
    super("Session lost while switching profile");
    this.name = "SwitchSessionLostError";
  }
}

/** Two ambiguous answers in a row: nothing was changed locally, the next refresh decides whether the session survived. */
export class SwitchUnconfirmedError extends Error {
  constructor() {
    super("Profile switch could not be confirmed");
    this.name = "SwitchUnconfirmedError";
  }
}

/** Another switch is still running (module level: survives the switcher menu unmounting). */
export class SwitchInProgressError extends Error {
  constructor() {
    super("A profile switch is already in progress");
    this.name = "SwitchInProgressError";
  }
}

type Tokens = { accessToken: string; refreshToken: string };

type Sent =
  | ({ kind: "ok" } & Tokens)
  /** 401 that is not `InvalidRefreshToken` (code `Unauthenticated`, or an empty/unknown body): the access token expired. */
  | { kind: "access-rejected" }
  | { kind: "refresh-dead" }
  /** No HTTP answer (network, timeout), 5xx or an unusable 200: the BE may have rotated the refresh token. */
  | { kind: "ambiguous" }
  /** Definitive refusal (403 `ProfileNotOwned`, 400, ...): nothing was rotated. */
  | { kind: "refused"; error: ApiError };

/** `ProfileSummaryDto` (the switcher entry) + the account email -> the viewer snapshot, without waiting for `GET me`. */
export function authUserFromSummary(summary: ProfileSummary, email: string): AuthUser {
  return {
    id: summary.id ?? "",
    email,
    displayName: summary.displayName ?? undefined,
    username: summary.username ?? undefined,
    avatarUrl: summary.avatarUrl ?? undefined,
  };
}

const readStored = (storage: Storage): Tokens | null => {
  const accessToken = storage.getItem(AUTH_STORAGE_KEYS.access);
  const refreshToken = storage.getItem(AUTH_STORAGE_KEYS.refresh);
  return accessToken && refreshToken ? { accessToken, refreshToken } : null;
};

async function send(tokens: Tokens, profileId: string, deps?: RefreshDeps): Promise<Sent> {
  const fetchFn = deps?.fetchFn ?? fetch;
  let response: Response;
  try {
    response = await fetchFn(`${API_BASE_URL}${SWITCH_PATH}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokens.accessToken}` },
      body: JSON.stringify({ profileId, refreshToken: tokens.refreshToken }),
      signal: AbortSignal.timeout(SWITCH_TIMEOUT_MS),
    });
  } catch {
    return { kind: "ambiguous" };
  }

  if (response.ok) {
    try {
      const data = (await response.json()) as { accessToken?: string; refreshToken?: string };
      if (!data.accessToken || !data.refreshToken) throw new Error("Malformed switch response");
      return { kind: "ok", accessToken: data.accessToken, refreshToken: data.refreshToken };
    } catch {
      return { kind: "ambiguous" };
    }
  }
  if (response.status >= 500) return { kind: "ambiguous" };

  const problem = await parseProblem(response);
  const error = isApiError(problem) ? problem : networkError(problem);
  if (response.status === 401) return hasCode(error, "InvalidRefreshToken") ? { kind: "refresh-dead" } : { kind: "access-rejected" };
  return { kind: "refused", error };
}

async function switchInsideLock(target: ProfileSummary, email: string, deps?: RefreshDeps): Promise<AuthUser> {
  const storage = deps?.storage ?? localStorage;
  const { actions } = useAuthStore.getState();
  // localStorage is the cross-tab truth (another tab may have rotated while this one waited for the lock)
  let tokens = readStored(storage);
  if (!tokens) throw new Error("Not signed in");
  const profileId = target.id ?? "";

  let result = await send(tokens, profileId, deps);

  if (result.kind === "access-rejected") {
    const outcome = await rotateTokens(tokens.accessToken, deps);
    if (outcome.status === "unauthorized") {
      actions.clearAuth();
      throw new SwitchSessionLostError();
    }
    // Rotation failed without an answer: nothing changed, the switch never reached the BE
    if (outcome.status === "transient") throw outcome.error;
    tokens = { accessToken: outcome.accessToken, refreshToken: outcome.refreshToken };
    // The old pair is dead whatever the PUT does next: the rotated one lives in storage AND the store from here on
    actions.setTokens(tokens.accessToken, tokens.refreshToken);
    result = await send(tokens, profileId, deps);
  }

  if (result.kind === "ambiguous") {
    // Safe: at-most-once. The same PUT either succeeds now, or answers 401 InvalidRefreshToken (it did rotate before)
    result = await send(tokens, profileId, deps);
    if (result.kind === "ambiguous") throw new SwitchUnconfirmedError();
  }

  switch (result.kind) {
    case "refresh-dead": {
      const now = readStored(storage);
      // Another tab rotated meanwhile (possible without navigator.locks): not our session to end
      if (now && now.refreshToken !== tokens.refreshToken) throw new Error("Session changed in another tab");
      actions.clearAuth();
      throw new SwitchSessionLostError();
    }
    case "refused":
      throw result.error;
    case "access-rejected":
      throw new Error("Access token rejected after rotation");
    case "ok": {
      const user = authUserFromSummary(target, email);
      // Tokens + user together, BEFORE the lock is released: a waiting refresher adopts the NEW pair, never the dead one
      actions.replaceSession(result.accessToken, result.refreshToken, user);
      return user;
    }
  }
}

let pending: Promise<AuthUser> | null = null;

/**
 * Switches the signed-in session to another profile of the account & commits the new identity. Rejects with
 * `SwitchInProgressError` (nothing sent) while another switch runs, `SwitchSessionLostError` (auth cleared),
 * `SwitchUnconfirmedError` (state untouched), the BE `ApiError` of a refusal, or a plain error before anything was sent.
 */
export function switchProfile(target: ProfileSummary, deps?: RefreshDeps): Promise<AuthUser> {
  if (pending) return Promise.reject(new SwitchInProgressError());

  const storage = deps?.storage ?? localStorage;
  const email = useAuthStore.getState().user?.email;
  if (!target.id || !target.username || !target.displayName) return Promise.reject(new Error("Incomplete profile summary"));
  if (email === undefined || !readStored(storage)) return Promise.reject(new Error("Not signed in"));

  const run = withRefreshLock(() => switchInsideLock(target, email, deps), deps).finally(() => {
    pending = null;
  });
  pending = run;
  return run;
}

import { API_BASE_URL } from "./api-config";
import { isApiError, networkError, parseProblem } from "./api-error";

/**
 * Anonymous BE read for server components (tokens live in localStorage, so the server has no viewer).
 * Failures throw `ApiError`; callers map ONLY `isNotFound` to `notFound()`, anything else must reach `error.tsx`.
 */
export async function serverApiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...init, cache: "no-store" });
  } catch (cause) {
    throw networkError(cause);
  }
  if (!response.ok) throw await parseProblem(response);
  return (await response.json()) as T;
}

/** True only for an HTTP 404 from the BE; network, TLS & 5xx failures are never "not found". */
export const isNotFound = (error: unknown): boolean => isApiError(error) && error.kind === "http" && error.status === 404;

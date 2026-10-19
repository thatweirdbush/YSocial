import { ApiError } from "./api-error";

const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** BE ids are GUIDs; mock ids (`author-01`) are not and must never reach a real route. */
export const isBackendId = (id: string): boolean => GUID_PATTERN.test(id);

/** Returns `id` when it is a BE id, else throws a local 404 (no network call). */
export function requireBackendId(id: string): string {
  if (isBackendId(id)) return id;
  throw new ApiError({ kind: "http", status: 404, code: "NotFound", detail: "Not a backend id" });
}

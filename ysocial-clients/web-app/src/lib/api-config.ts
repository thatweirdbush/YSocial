export type ApiSlice = "auth" | "content" | "graph" | "activity";

/** Cumulative order: a slice is real only when every earlier slice is real too. */
export const API_SLICE_ORDER: readonly ApiSlice[] = ["auth", "content", "graph", "activity"];

const DEFAULT_API_BASE_URL = "https://localhost:49895";

/** BE origin without trailing slash (`NEXT_PUBLIC_API_BASE_URL`). */
export const API_BASE_URL: string = (process.env.NEXT_PUBLIC_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/+$/, "");

/** Mock mode sentinel: shells delete a variable set to empty, so "empty" cannot select the mock adapters. */
export const MOCK_SLICES = "none";

const isSlice = (name: string): name is ApiSlice => (API_SLICE_ORDER as readonly string[]).includes(name);

/**
 * Longest valid prefix of `API_SLICE_ORDER` found in `raw`; unknown or gapped names are ignored. Unset = every slice
 * is real (default); `none` (or an empty `.env` value) = mock adapters.
 */
export function parseRealSlices(raw: string | undefined): ApiSlice[] {
  if (raw === undefined) return [...API_SLICE_ORDER];
  const names = raw
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name !== "" && name !== MOCK_SLICES);
  const requested = new Set(names);
  const result: ApiSlice[] = [];
  for (const slice of API_SLICE_ORDER) {
    if (!requested.has(slice)) break;
    result.push(slice);
  }
  if (names.length > 0 && process.env.NODE_ENV === "development") {
    const dropped = names.filter((name) => !isSlice(name) || !result.includes(name));
    if (dropped.length > 0) {
      console.warn(`[api-config] ignored slices: ${dropped.join(", ")} (cumulative order: ${API_SLICE_ORDER.join(",")})`);
    }
  }
  return result;
}

/** True when `slice` talks to the real BE (`NEXT_PUBLIC_REAL_API_SLICES`, read per call). */
export function isRealApi(slice: ApiSlice): boolean {
  return parseRealSlices(process.env.NEXT_PUBLIC_REAL_API_SLICES).includes(slice);
}

// Visible-tab seconds per local day, kept ONLY on this device (localStorage). Own module & key: it is written
// every 30s, unlike the rarely-changing `settings-store`.

export const USAGE_STORAGE_KEY = "ysocial_usage_v1";

const TICK_MS = 5_000;
const TICK_SECONDS = TICK_MS / 1000;
const FLUSH_MS = 30_000;
const KEEP_DAYS = 30;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

type Usage = Record<string, number>;

const pad = (value: number) => String(value).padStart(2, "0");

/** Local calendar day, `YYYY-MM-DD`. */
export const localDateKey = (ms: number): string => {
  const date = new Date(ms);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/** Never throws; storage is user-editable, so only well-formed non-negative entries survive. */
export function parseUsage(raw: string | null): Usage {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    const usage: Usage = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (DAY_KEY.test(key) && typeof value === "number" && Number.isFinite(value) && value >= 0) usage[key] = value;
    }
    return usage;
  } catch {
    return {};
  }
}

/** Raw stored value (stable string for `useSyncExternalStore`). */
export function readUsageRaw(): string | null {
  try {
    return localStorage.getItem(USAGE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export const readUsage = (): Usage => parseUsage(readUsageRaw());

/** `<today>|<raw>`: one stable string, so the day rolling over re-renders a section that stays open. */
export const readUsageSnapshot = (): string => `${localDateKey(Date.now())}|${readUsageRaw() ?? ""}`;

/** Re-reads on other tabs' writes & periodically (this tab's own flushes do not fire `storage`). */
export function subscribeUsage(onChange: () => void): () => void {
  const timer = setInterval(onChange, FLUSH_MS);
  window.addEventListener("storage", onChange);
  return () => {
    clearInterval(timer);
    window.removeEventListener("storage", onChange);
  };
}

/** `count` days ending at `today` (inclusive), oldest first, zero-filled. */
export function usageForLastDays(usage: Usage, count: number, today: string): Array<{ date: string; seconds: number }> {
  const [year, month, day] = today.split("-").map(Number);
  return Array.from({ length: count }, (_, index) => {
    const date = localDateKey(new Date(year, month - 1, day - (count - 1 - index)).getTime());
    return { date, seconds: usage[date] ?? 0 };
  });
}

/** Mean seconds per day over the last `days` days ending today; older & future entries are ignored. */
export function dailyAverage(usage: Usage, days: number, today: string): number {
  const total = usageForLastDays(usage, days, today).reduce((sum, { seconds }) => sum + seconds, 0);
  return Math.round(total / days);
}

/**
 * Counts 5s ticks while the tab is visible, flushes every 30s & when the tab hides (adds to what storage holds, so several
 * tabs sum up), keeps 30 days. Returns a stop function that flushes.
 */
export function startUsageTracking(now: () => number = Date.now): () => void {
  let pending: Usage = {};

  const tick = () => {
    if (document.visibilityState !== "visible") return;
    const key = localDateKey(now());
    pending[key] = (pending[key] ?? 0) + TICK_SECONDS;
  };

  const flush = () => {
    if (Object.keys(pending).length === 0) return;
    const stored = readUsage();
    for (const [key, seconds] of Object.entries(pending)) stored[key] = (stored[key] ?? 0) + seconds;
    pending = {};

    const oldestKept = localDateKey(now() - (KEEP_DAYS - 1) * 86_400_000);
    for (const key of Object.keys(stored)) {
      if (key < oldestKept) delete stored[key];
    }
    try {
      localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(stored));
    } catch {
      // Ignore persistence failure; this tab simply stops recording
    }
  };

  const onVisibility = () => {
    if (document.visibilityState === "hidden") flush();
  };

  const tickTimer = setInterval(tick, TICK_MS);
  const flushTimer = setInterval(flush, FLUSH_MS);
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    clearInterval(tickTimer);
    clearInterval(flushTimer);
    document.removeEventListener("visibilitychange", onVisibility);
    flush();
  };
}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dailyAverage, localDateKey, readUsage, startUsageTracking, USAGE_STORAGE_KEY, usageForLastDays } from "./usage-tracker";

const DAY = 86_400_000;
const NOW = new Date(2026, 9, 21, 9, 0, 0).getTime();
const TODAY = localDateKey(NOW);

let visibility: DocumentVisibilityState = "visible";

const setVisibility = (state: DocumentVisibilityState) => {
  visibility = state;
  document.dispatchEvent(new Event("visibilitychange"));
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
  localStorage.removeItem(USAGE_STORAGE_KEY);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("startUsageTracking", () => {
  it("ticks add 5s each while the tab is visible and flush every 30s", () => {
    const stop = startUsageTracking();

    vi.advanceTimersByTime(29_000);
    expect(readUsage()).toEqual({});
    vi.advanceTimersByTime(1_000);

    expect(readUsage()[TODAY]).toBe(30);
    stop();
  });

  it("a hidden tab accrues nothing", () => {
    visibility = "hidden";
    const stop = startUsageTracking();

    vi.advanceTimersByTime(60_000);
    stop();

    expect(readUsage()).toEqual({});
  });

  it("flushes pending seconds when the tab is hidden", () => {
    const stop = startUsageTracking();
    vi.advanceTimersByTime(10_000);
    expect(readUsage()).toEqual({});

    setVisibility("hidden");

    expect(readUsage()[TODAY]).toBe(10);
    vi.advanceTimersByTime(20_000);
    expect(readUsage()[TODAY]).toBe(10);
    stop();
  });

  it("stopping flushes and stops ticking", () => {
    const stop = startUsageTracking();
    vi.advanceTimersByTime(15_000);

    stop();
    vi.advanceTimersByTime(60_000);

    expect(readUsage()[TODAY]).toBe(15);
  });

  it("keeps 30 days and prunes older entries on flush", () => {
    const old = localDateKey(NOW - 40 * DAY);
    const recent = localDateKey(NOW - 29 * DAY);
    localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify({ [old]: 100, [recent]: 200 }));
    const stop = startUsageTracking();

    vi.advanceTimersByTime(30_000);
    stop();

    expect(readUsage()).toEqual({ [recent]: 200, [TODAY]: 30 });
  });

  it("adds to what the day already holds (several tabs / reloads)", () => {
    localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify({ [TODAY]: 100 }));
    const stop = startUsageTracking();

    vi.advanceTimersByTime(30_000);
    stop();

    expect(readUsage()[TODAY]).toBe(130);
  });
});

describe("readUsage", () => {
  it("ignores a corrupt payload and non-numeric entries", () => {
    localStorage.setItem(USAGE_STORAGE_KEY, "{not json");
    expect(readUsage()).toEqual({});

    localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify({ [TODAY]: 60, bad: "x", neg: -5 }));
    expect(readUsage()).toEqual({ [TODAY]: 60 });
  });
});

describe("dailyAverage & usageForLastDays", () => {
  const usage = {
    [localDateKey(NOW)]: 700,
    [localDateKey(NOW - DAY)]: 700,
    [localDateKey(NOW - 6 * DAY)]: 700,
    [localDateKey(NOW - 7 * DAY)]: 9_999,
    [localDateKey(NOW + 2 * DAY)]: 9_999,
  };

  it("averages the last 7 days (today included), ignoring older & future dates", () => {
    expect(dailyAverage(usage, 7, TODAY)).toBe(300);
  });

  it("is 0 without data", () => {
    expect(dailyAverage({}, 7, TODAY)).toBe(0);
  });

  it("lists the last days oldest first, zero-filled, ending today", () => {
    const days = usageForLastDays(usage, 7, TODAY);

    expect(days).toHaveLength(7);
    expect(days[6]).toEqual({ date: TODAY, seconds: 700 });
    expect(days[0]).toEqual({ date: localDateKey(NOW - 6 * DAY), seconds: 700 });
    expect(days[3].seconds).toBe(0);
  });
});

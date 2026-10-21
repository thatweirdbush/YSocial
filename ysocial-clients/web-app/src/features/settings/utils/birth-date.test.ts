import { describe, expect, it } from "vitest";
import { isPastBirthDate, maxBirthDate, toWireBirthDate } from "./birth-date";

// Run under `TZ=Asia/Ho_Chi_Minh` & `TZ=America/Los_Angeles`: a date string must never be shifted by a Date round trip
describe("toWireBirthDate", () => {
  it("appends midnight UTC to the plain date (no Date object, no timezone shift)", () => {
    expect(toWireBirthDate("1999-05-20")).toBe("1999-05-20T00:00:00Z");
    expect(toWireBirthDate("2000-01-01")).toBe("2000-01-01T00:00:00Z");
    expect(toWireBirthDate("2001-12-31")).toBe("2001-12-31T00:00:00Z");
  });
});

describe("maxBirthDate", () => {
  it("is yesterday in local calendar terms, across month & year borders", () => {
    expect(maxBirthDate(new Date(2026, 9, 21, 0, 30).getTime())).toBe("2026-10-20");
    expect(maxBirthDate(new Date(2026, 9, 21, 23, 30).getTime())).toBe("2026-10-20");
    expect(maxBirthDate(new Date(2026, 2, 1, 12).getTime())).toBe("2026-02-28");
    expect(maxBirthDate(new Date(2026, 0, 1, 12).getTime())).toBe("2025-12-31");
  });
});

describe("isPastBirthDate", () => {
  const now = new Date(2026, 9, 21, 12).getTime();

  it("accepts real dates up to yesterday", () => {
    expect(isPastBirthDate("1999-05-20", now)).toBe(true);
    expect(isPastBirthDate("2026-10-20", now)).toBe(true);
  });

  it("rejects today, the future, malformed and impossible dates", () => {
    expect(isPastBirthDate("2026-10-21", now)).toBe(false);
    expect(isPastBirthDate("2030-01-01", now)).toBe(false);
    expect(isPastBirthDate("20-05-1999", now)).toBe(false);
    expect(isPastBirthDate("1999-02-30", now)).toBe(false);
    expect(isPastBirthDate("", now)).toBe(false);
    expect(isPastBirthDate("1899-12-31", now)).toBe(false);
  });
});

import { describe, expect, it, vi } from "vitest";

import { USERNAME_PATTERN } from "@/features/auth/utils/mock-session";
import { FAN_BASE_IDS, isFanId, SEED_FAN_FOLLOWS, SEED_FANS } from "./seed-fans";

describe("seed-fans", () => {
  it("is deterministic across imports", async () => {
    vi.resetModules();
    const again = await import("./seed-fans");
    expect(again.SEED_FANS.map((fan) => fan.id)).toEqual(SEED_FANS.map((fan) => fan.id));
    expect(again.SEED_FANS.map((fan) => fan.username)).toEqual(SEED_FANS.map((fan) => fan.username));
  });

  it("gives every base user 30-60 fans", () => {
    expect(FAN_BASE_IDS).toHaveLength(9);
    for (const baseId of FAN_BASE_IDS) {
      const count = SEED_FAN_FOLLOWS[baseId]?.length ?? 0;
      expect(count).toBeGreaterThanOrEqual(30);
      expect(count).toBeLessThanOrEqual(60);
    }
  });

  it("uses unique, well-formed ids and usernames", () => {
    const ids = SEED_FANS.map((fan) => fan.id);
    const usernames = SEED_FANS.map((fan) => fan.username);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(usernames).size).toBe(usernames.length);
    for (const fan of SEED_FANS) {
      expect(fan.id).toMatch(/^fan-\d{2}-\d{3}$/);
      expect(fan.username).toMatch(USERNAME_PATTERN);
      expect(isFanId(fan.id)).toBe(true);
    }
  });

  it("never verifies fans or gives them a bio", () => {
    for (const fan of SEED_FANS) {
      expect(fan.isVerified).toBeFalsy();
      expect("bio" in fan).toBe(false);
    }
  });

  it("is a single level: fans are only referenced as followers of base users", () => {
    for (const baseId of Object.keys(SEED_FAN_FOLLOWS)) {
      expect(isFanId(baseId)).toBe(false);
    }
  });
});

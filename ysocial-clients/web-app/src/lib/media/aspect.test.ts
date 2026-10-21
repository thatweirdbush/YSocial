import { describe, expect, it } from "vitest";

import { aspectClassOf } from "./aspect";

describe("aspectClassOf (box reserved from width/height, ratio clamped to 4:5..16:9)", () => {
  it.each([
    [1000, 1000, "aspect-square"],
    [1920, 1080, "aspect-video"],
    [4000, 1000, "aspect-video"], // panorama clamps to 16:9
    [500, 2000, "aspect-[4/5]"], // tall clamps to 4:5
    [800, 1000, "aspect-[4/5]"],
    [1200, 800, "aspect-[3/2]"],
    [1600, 1200, "aspect-[4/3]"],
    [1000, 800, "aspect-[5/4]"],
  ])("%ix%i -> %s", (width, height, expected) => {
    expect(aspectClassOf(width, height)).toBe(expected);
  });

  it("falls back to square for unknown or invalid sizes", () => {
    expect(aspectClassOf(0, 100)).toBe("aspect-square");
    expect(aspectClassOf(100, 0)).toBe("aspect-square");
    expect(aspectClassOf(Number.NaN, 100)).toBe("aspect-square");
    expect(aspectClassOf(undefined, undefined)).toBe("aspect-square");
  });
});

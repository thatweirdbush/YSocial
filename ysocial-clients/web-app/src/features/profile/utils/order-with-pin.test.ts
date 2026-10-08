import { describe, expect, it } from "vitest";

import { orderWithPin } from "./order-with-pin";

describe("orderWithPin", () => {
  it("moves the pinned id to the front", () => {
    expect(orderWithPin(["a", "b", "c"], "c")).toEqual(["c", "a", "b"]);
  });

  it("returns the same reference when the pinned id is absent", () => {
    const ids = ["a", "b"];
    expect(orderWithPin(ids, "z")).toBe(ids);
  });

  it("returns the same reference when there is no pin", () => {
    const ids = ["a", "b"];
    expect(orderWithPin(ids, undefined)).toBe(ids);
  });

  it("returns the same reference when the pinned id is already first", () => {
    const ids = ["a", "b"];
    expect(orderWithPin(ids, "a")).toBe(ids);
  });
});

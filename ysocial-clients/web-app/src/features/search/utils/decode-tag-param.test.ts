import { describe, expect, it } from "vitest";
import { decodeTagParam, isTagSort } from "./decode-tag-param";

describe("decodeTagParam", () => {
  it("decodes Vietnamese tags", () => {
    expect(decodeTagParam("%C4%90%C3%A0L%E1%BA%A1t")).toBe("ĐàLạt");
  });

  it("strips a leading #", () => {
    expect(decodeTagParam("%23NextJS")).toBe("NextJS");
  });

  it("rejects broken encoding and empty tags", () => {
    expect(decodeTagParam("%E0%A4")).toBeNull();
    expect(decodeTagParam("")).toBeNull();
    expect(decodeTagParam("%23")).toBeNull();
  });
});

describe("isTagSort", () => {
  it("accepts only top & latest", () => {
    expect(isTagSort("latest")).toBe(true);
    expect(isTagSort("new")).toBe(false);
  });
});

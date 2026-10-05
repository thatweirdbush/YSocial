import { describe, expect, it } from "vitest";
import { extractHashtags, normalizeText, tokenize } from "./text";

describe("normalizeText", () => {
  it("strips diacritics, maps đ and collapses whitespace", () => {
    expect(normalizeText("  Đà   LẠT ")).toBe("da lat");
    expect(normalizeText("Phở")).toBe("pho");
  });
});

describe("tokenize", () => {
  it("splits normalized text on whitespace", () => {
    expect(tokenize(" Next  JS ")).toEqual(["next", "js"]);
  });

  it("returns no tokens for blank input", () => {
    expect(tokenize("   ")).toEqual([]);
  });
});

describe("extractHashtags", () => {
  it("keeps Vietnamese letters, dedupes by normalized form and ignores a lone #", () => {
    expect(extractHashtags("Hi #ĐàLạt #NextJS #dalat #")).toEqual(["ĐàLạt", "NextJS"]);
  });

  it("requires # at the start or after whitespace", () => {
    expect(extractHashtags("a#b #c")).toEqual(["c"]);
  });
});

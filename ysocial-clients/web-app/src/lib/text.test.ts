import { describe, expect, it } from "vitest";
import { extractHashtags, MENTION_PATTERN, normalizeText, tokenize } from "./text";

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

describe("hashtag & mention boundaries", () => {
  it("ignores URL fragments and identifiers", () => {
    expect(extractHashtags("xem https://x.com/page#section và id#42")).toEqual([]);
  });

  it("keeps combining marks of decomposed (NFD) text inside the tag", () => {
    const nfd = "Sáng nay #ĐàLạt".normalize("NFD");
    const [tag] = extractHashtags(nfd);
    expect(normalizeText(tag)).toBe("dalat");
  });

  it("does not capture a trailing period in a mention", () => {
    const [match] = "cảm ơn @anquoc.dev.".matchAll(MENTION_PATTERN);
    expect(match[1]).toBe("anquoc.dev");
  });
});

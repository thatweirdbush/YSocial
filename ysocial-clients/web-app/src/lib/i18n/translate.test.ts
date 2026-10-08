import { describe, expect, it } from "vitest";

import { translate, type TranslationKey } from "./translate";

describe("translate", () => {
  it("looks up a key in the requested locale", () => {
    expect(translate("vi", "hoverCard.retry")).toBe("Thử lại");
  });

  it("replaces {param} placeholders", () => {
    expect(translate("en", "card.minutesAgo", { n: 5 })).toBe("5m ago");
  });

  it("returns the key when it is unknown", () => {
    expect(translate("vi", "nope.missing" as TranslationKey)).toBe("nope.missing");
  });

  it("returns the key when the path ends at a non-string node", () => {
    expect(translate("vi", "card" as TranslationKey)).toBe("card");
  });
});

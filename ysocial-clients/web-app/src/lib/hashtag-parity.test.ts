import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { extractHashtags, foldText, MAX_HASHTAG_LENGTH, MAX_HASHTAGS_PER_POST } from "./text";

// Golden fixture shared with the BE (`HashtagParserTests`): both sides must produce identical keys & displays
interface Case {
  name: string;
  content: string;
  tags: { key: string; display: string }[];
}

const FIXTURE = resolve(process.cwd(), "../../docs/fixtures/hashtag-parity.json");
const cases: Case[] = JSON.parse(readFileSync(FIXTURE, "utf8"));

describe("hashtag parity with BE", () => {
  it("loads the shared fixture", () => {
    expect(cases.length).toBeGreaterThan(15);
  });

  it.each(cases.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    const displays = extractHashtags(c.content);
    expect(displays.map((display) => ({ key: foldText(display), display }))).toEqual(c.tags);
  });

  it("caps distinct tags per post like the BE", () => {
    const content = Array.from({ length: MAX_HASHTAGS_PER_POST + 5 }, (_, i) => `#t${i}`).join(" ");
    expect(extractHashtags(content)).toHaveLength(MAX_HASHTAGS_PER_POST);
  });

  it("limit is the BE limit", () => {
    expect(MAX_HASHTAG_LENGTH).toBe(50);
  });
});

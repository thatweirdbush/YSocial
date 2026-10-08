import { describe, expect, it } from "vitest";

import { normalizeUsername, resolveProfileRoute } from "./resolve-profile-route";

const session = { id: "2", username: "new.user" };

describe("normalizeUsername", () => {
  it.each([
    ["anquoc.dev", "anquoc.dev"],
    ["@anquoc.dev", "anquoc.dev"],
    ["%40AnQuoc.Dev", "anquoc.dev"],
  ])("normalizes %s", (raw, expected) => {
    expect(normalizeUsername(raw)).toBe(expected);
  });

  it("never throws on a malformed encoding", () => {
    expect(() => normalizeUsername("%E0%A4%A")).not.toThrow();
  });
});

describe("resolveProfileRoute", () => {
  it.each(["anquoc.dev", "@anquoc.dev", "%40AnQuoc.Dev"])("resolves the seed user for %s", (raw) => {
    expect(resolveProfileRoute(raw, null)).toMatchObject({ kind: "seed", user: { id: "author-03" } });
  });

  it("resolves the current session's runtime user", () => {
    expect(resolveProfileRoute("new.user", session)).toEqual({ kind: "session", identity: session });
  });

  it("is null for a different username than the session's", () => {
    expect(resolveProfileRoute("other.user", session)).toBeNull();
  });

  it("is null without a session for an unknown username", () => {
    expect(resolveProfileRoute("nope", null)).toBeNull();
  });

  it("lets a seed user win over a session with the same username", () => {
    expect(resolveProfileRoute("ysocial_member", { id: "9", username: "ysocial_member" })).toMatchObject({ kind: "seed" });
  });

  it("resolves a malformed encoding to null", () => {
    expect(resolveProfileRoute("%E0%A4%A", session)).toBeNull();
  });
});

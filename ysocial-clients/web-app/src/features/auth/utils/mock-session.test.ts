import { afterEach, describe, expect, it } from "vitest";

import {
  clearMockSessionCookie,
  MOCK_SESSION_COOKIE,
  parseMockSession,
  serializeMockSession,
  toMockSession,
  writeMockSessionCookie,
} from "./mock-session";

const encode = (value: unknown) => encodeURIComponent(JSON.stringify(value));

describe("mock-session", () => {
  afterEach(() => clearMockSessionCookie());

  it("round-trips an identity", () => {
    const identity = { id: "2", username: "new.user" };
    expect(parseMockSession(serializeMockSession(identity))).toEqual(identity);
  });

  it("drops extra fields", () => {
    const raw = encode({ id: "2", username: "new.user", displayName: "Leak" });
    expect(parseMockSession(raw)).toEqual({ id: "2", username: "new.user" });
  });

  it("lowercases the username", () => {
    expect(parseMockSession(encode({ id: "2", username: "New.User" }))).toEqual({ id: "2", username: "new.user" });
  });

  it.each([
    ["undefined", undefined],
    ["empty string", ""],
    ["bad encoding", "%E0%A4%A"],
    ["not json", "not-json"],
    ["missing username", encode({ id: "2" })],
    ["wrong id type", encode({ id: 2, username: "a" })],
    ["empty id", encode({ id: "", username: "a" })],
    ["invalid username shape", encode({ id: "2", username: "Bad Name!" })],
    ["username too long", encode({ id: "2", username: "a".repeat(31) })],
    ["json null", "null"],
  ])("returns null for %s", (_label, raw) => {
    expect(parseMockSession(raw)).toBeNull();
  });

  it("derives an identity from an auth user", () => {
    expect(toMockSession({ id: "1", email: "Mem@x.dev" })).toEqual({ id: "1", username: "mem" });
    expect(toMockSession({ id: "1", email: "a@b.c", username: "Ysocial_Member" })).toEqual({
      id: "1",
      username: "ysocial_member",
    });
  });

  it("writes and clears the cookie", () => {
    writeMockSessionCookie({ id: "2", username: "new.user" });
    expect(document.cookie).toContain(`${MOCK_SESSION_COOKIE}=`);
    clearMockSessionCookie();
    expect(document.cookie).not.toContain(`${MOCK_SESSION_COOKIE}=`);
  });
});

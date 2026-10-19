import { afterEach, describe, expect, it, vi } from "vitest";
import { setRealSlices } from "@/test/api-test-utils";
import { API_SLICE_ORDER, isRealApi, parseRealSlices } from "./api-config";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("parseRealSlices", () => {
  it("empty env -> no real slice", () => {
    expect(parseRealSlices(undefined)).toEqual([]);
    expect(parseRealSlices("")).toEqual([]);
  });

  it('"auth" -> auth real only', () => {
    expect(parseRealSlices("auth")).toEqual(["auth"]);
  });

  it('"auth,content" -> content real', () => {
    expect(parseRealSlices("auth,content")).toEqual(["auth", "content"]);
    expect(parseRealSlices(" auth , content ")).toEqual(["auth", "content"]);
  });

  it('"content" alone -> none (gap, warns)', () => {
    vi.stubEnv("NODE_ENV", "development");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(parseRealSlices("content")).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  it('"auth,graph" -> auth only', () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(parseRealSlices("auth,graph")).toEqual(["auth"]);
  });

  it("unknown slice name ignored", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(parseRealSlices("auth,bogus,content")).toEqual(["auth", "content"]);
  });

  it("full list in order", () => {
    expect(parseRealSlices(API_SLICE_ORDER.join(","))).toEqual([...API_SLICE_ORDER]);
  });
});

describe("isRealApi", () => {
  it("reads env at call time", () => {
    setRealSlices("auth,content");
    expect(isRealApi("auth")).toBe(true);
    expect(isRealApi("content")).toBe(true);
    expect(isRealApi("graph")).toBe(false);
    setRealSlices(undefined);
    expect(isRealApi("auth")).toBe(false);
  });
});

describe("API_BASE_URL", () => {
  it("defaults to local BE", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "");
    vi.resetModules();
    const mod = await import("./api-config");
    expect(mod.API_BASE_URL).toBe("https://localhost:49895");
  });

  it("override trims trailing slash", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.test/");
    vi.resetModules();
    const mod = await import("./api-config");
    expect(mod.API_BASE_URL).toBe("https://api.example.test");
  });
});

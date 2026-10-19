import { describe, expect, it, vi } from "vitest";
import { isApiError } from "./api-error";
import { isBackendId, requireBackendId } from "./backend-id";

describe("backend-id", () => {
  it("isBackendId accepts GUID, rejects mock ids", () => {
    expect(isBackendId("0b8f1c52-6a3e-4c53-9b42-5f9d6f7a1e10")).toBe(true);
    expect(isBackendId("0B8F1C52-6A3E-4C53-9B42-5F9D6F7A1E10")).toBe(true);
    expect(isBackendId("author-01")).toBe(false);
    expect(isBackendId("")).toBe(false);
  });

  it("requireBackendId returns a valid id", () => {
    expect(requireBackendId("0b8f1c52-6a3e-4c53-9b42-5f9d6f7a1e10")).toBe("0b8f1c52-6a3e-4c53-9b42-5f9d6f7a1e10");
  });

  it("requireBackendId throws local 404 without fetch", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    try {
      requireBackendId("author-01");
      expect.unreachable();
    } catch (error) {
      expect(isApiError(error)).toBe(true);
      expect(error).toMatchObject({ kind: "http", status: 404, code: "NotFound" });
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

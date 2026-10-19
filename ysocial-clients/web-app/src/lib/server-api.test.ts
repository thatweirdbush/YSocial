import { afterEach, describe, expect, it, vi } from "vitest";
import { mockFetchSequence, problem, type MockStep } from "@/test/api-test-utils";
import { API_BASE_URL } from "./api-config";
import { isNotFound, serverApiFetch } from "./server-api";

function useFetch(steps: MockStep[]) {
  const fake = mockFetchSequence(steps);
  vi.stubGlobal("fetch", fake.fetchFn);
  return fake.calls;
}
afterEach(() => vi.unstubAllGlobals());

describe("serverApiFetch", () => {
  it("200 returns parsed JSON, no-store, no Authorization", async () => {
    const calls = useFetch([{ status: 200, body: { id: "1" } }]);
    expect(await serverApiFetch("/api/users/by-username/x")).toEqual({ id: "1" });
    expect(calls[0].url).toBe(`${API_BASE_URL}/api/users/by-username/x`);
    expect(calls[0].init?.cache).toBe("no-store");
    expect(new Headers(calls[0].init?.headers).get("Authorization")).toBeNull();
  });

  it("404 throws ApiError status 404 (isNotFound true)", async () => {
    useFetch([problem(404, "NotFound")]);
    const error = await serverApiFetch("/api/x").catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 404, code: "NotFound" });
    expect(isNotFound(error)).toBe(true);
  });

  it("network failure (TLS, offline) throws kind network, not isNotFound", async () => {
    useFetch([{ status: 0, reject: new TypeError("fetch failed") }]);
    const error = await serverApiFetch("/api/x").catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: "network" });
    expect(isNotFound(error)).toBe(false);
  });

  it("500 is not isNotFound", async () => {
    useFetch([problem(500, "InternalError")]);
    const error = await serverApiFetch("/api/x").catch((e: unknown) => e);
    expect(isNotFound(error)).toBe(false);
  });

  it("isNotFound false for non ApiError", () => {
    expect(isNotFound(new Error("x"))).toBe(false);
  });
});

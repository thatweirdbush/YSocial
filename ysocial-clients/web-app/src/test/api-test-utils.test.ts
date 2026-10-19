import { describe, expect, it, vi } from "vitest";
import { createLockFake, dispatchStorage, mockFetchSequence, problem, setRealSlices } from "./api-test-utils";

describe("mockFetchSequence", () => {
  it("returns steps in order & records calls", async () => {
    const { fetchFn, calls } = mockFetchSequence([
      { status: 200, body: { a: 1 } },
      { status: 204 },
    ]);
    const first = await fetchFn("https://x/one", { method: "POST" });
    const second = await fetchFn("https://x/two");
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ a: 1 });
    expect(second.status).toBe(204);
    expect(calls.map((c) => c.url)).toEqual(["https://x/one", "https://x/two"]);
    expect(calls[0].init?.method).toBe("POST");
  });

  it("rejects when a step carries an error", async () => {
    const { fetchFn } = mockFetchSequence([{ status: 0, reject: new TypeError("Failed to fetch") }]);
    await expect(fetchFn("https://x")).rejects.toThrow("Failed to fetch");
  });
});

describe("problem", () => {
  it("builds ProblemDetails body with code", async () => {
    const { fetchFn } = mockFetchSequence([problem(409, "EmailTaken", { traceId: "t1" })]);
    const res = await fetchFn("https://x");
    expect(res.status).toBe(409);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
    expect(await res.json()).toMatchObject({ status: 409, code: "EmailTaken", traceId: "t1" });
  });
});

describe("createLockFake", () => {
  it("runs 2 requests for same name sequentially", async () => {
    const locks = createLockFake();
    const order: string[] = [];
    const a = locks.request("n", async () => {
      order.push("a-start");
      await Promise.resolve();
      await Promise.resolve();
      order.push("a-end");
    });
    const b = locks.request("n", async () => {
      order.push("b-start");
      order.push("b-end");
    });
    await Promise.all([a, b]);
    expect(order).toEqual(["a-start", "a-end", "b-start", "b-end"]);
  });
});

describe("dispatchStorage", () => {
  it("reaches storage listeners", () => {
    const listener = vi.fn();
    window.addEventListener("storage", listener);
    dispatchStorage("k", "new", "old");
    window.removeEventListener("storage", listener);
    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0][0] as StorageEvent;
    expect([event.key, event.newValue, event.oldValue]).toEqual(["k", "new", "old"]);
  });
});

describe("setRealSlices", () => {
  it("sets env and restores after each test", () => {
    setRealSlices("auth");
    expect(process.env.NEXT_PUBLIC_REAL_API_SLICES).toBe("auth");
  });
  it("restored by afterEach", () => {
    expect(process.env.NEXT_PUBLIC_REAL_API_SLICES).toBeUndefined();
  });
});

import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { __clearResourceCache, useCachedResource } from "./use-cached-resource";

beforeEach(() => __clearResourceCache());

describe("useCachedResource", () => {
  it("loads on first mount", async () => {
    const load = vi.fn().mockResolvedValue(["a"]);
    const { result } = renderHook(() => useCachedResource("k", load));

    expect(result.current.data).toBeNull();
    await waitFor(() => expect(result.current.data).toEqual(["a"]));
  });

  it("renders the cached value at once on remount and revalidates", async () => {
    const load = vi.fn().mockResolvedValueOnce(["a"]).mockResolvedValueOnce(["b"]);
    const first = renderHook(() => useCachedResource("k", load));
    await waitFor(() => expect(first.result.current.data).toEqual(["a"]));
    first.unmount();

    const second = renderHook(() => useCachedResource("k", load));
    expect(second.result.current.data).toEqual(["a"]);
    await waitFor(() => expect(second.result.current.data).toEqual(["b"]));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("reports failure only when nothing is cached", async () => {
    const { result } = renderHook(() => useCachedResource("k", () => Promise.reject(new Error("x"))));
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.data).toBeNull();
  });
});

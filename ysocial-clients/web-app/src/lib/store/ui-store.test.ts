import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useComposerOpen, useUIStore } from "./ui-store";

describe("ui-store composer", () => {
  beforeEach(() => {
    useUIStore.setState({ composerOpen: false });
  });

  it("starts closed", () => {
    const { result } = renderHook(() => useComposerOpen());
    expect(result.current).toBe(false);
  });

  it("openComposer opens it", () => {
    useUIStore.getState().actions.openComposer();
    expect(useUIStore.getState().composerOpen).toBe(true);
  });

  it("setComposerOpen sets it explicitly", () => {
    useUIStore.getState().actions.openComposer();
    useUIStore.getState().actions.setComposerOpen(false);
    expect(useUIStore.getState().composerOpen).toBe(false);
  });
});

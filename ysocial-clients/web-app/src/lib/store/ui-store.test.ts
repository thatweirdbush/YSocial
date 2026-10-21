import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useComposerOpen, useUIStore, useVideoMuted } from "./ui-store";

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

describe("ui-store video sound (session preference)", () => {
  beforeEach(() => {
    useUIStore.setState({ videoMuted: true });
    localStorage.removeItem("ysocial_video_muted");
  });

  it("starts muted: autoplay must be silent until the user opts in", () => {
    const { result } = renderHook(() => useVideoMuted());
    expect(result.current).toBe(true);
  });

  it("toggleVideoMuted flips it for every reader of the store", () => {
    const { result } = renderHook(() => useVideoMuted());

    act(() => useUIStore.getState().actions.toggleVideoMuted());
    expect(result.current).toBe(false);

    act(() => useUIStore.getState().actions.toggleVideoMuted());
    expect(result.current).toBe(true);
  });

  it("setVideoMuted sets it explicitly", () => {
    useUIStore.getState().actions.setVideoMuted(false);
    expect(useUIStore.getState().videoMuted).toBe(false);
  });

  it("is session scoped: never written to storage", () => {
    useUIStore.getState().actions.setVideoMuted(false);

    expect(Object.keys(localStorage).filter((key) => key.toLowerCase().includes("mute"))).toEqual([]);
    expect(Object.keys(sessionStorage).filter((key) => key.toLowerCase().includes("mute"))).toEqual([]);
  });
});

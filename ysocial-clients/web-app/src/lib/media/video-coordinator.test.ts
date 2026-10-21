import { beforeEach, describe, expect, it, vi } from "vitest";

import { createVideoCoordinator } from "./video-coordinator";

function player() {
  return { play: vi.fn(), pause: vi.fn() };
}

describe("video coordinator (one app-wide arbiter)", () => {
  let coordinator: ReturnType<typeof createVideoCoordinator>;

  beforeEach(() => {
    coordinator = createVideoCoordinator();
  });

  it("plays a player that is at least 60% visible", () => {
    const a = player();
    const handle = coordinator.register(a);

    handle.report(0.6, 100);

    expect(a.play).toHaveBeenCalledTimes(1);
  });

  it("does not play below 60%", () => {
    const a = player();
    const handle = coordinator.register(a);

    handle.report(0.59, 100);

    expect(a.play).not.toHaveBeenCalled();
    expect(a.pause).toHaveBeenCalled();
  });

  it("plays only the most visible one and pauses the others", () => {
    const a = player();
    const b = player();
    const first = coordinator.register(a);
    const second = coordinator.register(b);

    first.report(0.7, 100);
    second.report(0.9, 500);

    expect(b.play).toHaveBeenCalled();
    expect(a.pause).toHaveBeenCalled();
    expect(coordinator.playingId()).toBe(second.id);
  });

  it("breaks a tie for the topmost one", () => {
    const a = player();
    const b = player();
    const lower = coordinator.register(a);
    const upper = coordinator.register(b);

    lower.report(0.8, 600);
    upper.report(0.8, 200);

    expect(coordinator.playingId()).toBe(upper.id);
  });

  it("hands over when the playing one scrolls out", () => {
    const a = player();
    const b = player();
    const first = coordinator.register(a);
    const second = coordinator.register(b);
    first.report(0.9, 100);
    second.report(0.65, 700);
    expect(coordinator.playingId()).toBe(first.id);

    first.report(0.1, -400);

    expect(coordinator.playingId()).toBe(second.id);
    expect(b.play).toHaveBeenCalled();
  });

  it("a user pause sticks until the video leaves and re-enters the view", () => {
    const a = player();
    const handle = coordinator.register(a);
    handle.report(0.9, 100);

    handle.userPaused();
    handle.report(0.95, 100);
    expect(coordinator.playingId()).toBeNull();

    handle.report(0.2, -300); // leaves
    handle.report(0.9, 100); // re-enters
    expect(coordinator.playingId()).toBe(handle.id);
  });

  it("a user play of a video below the threshold is allowed and wins the arbitration", () => {
    const a = player();
    const b = player();
    const first = coordinator.register(a);
    const second = coordinator.register(b);
    first.report(0.9, 100);
    second.report(0.3, 700);

    second.userPlayed();

    expect(coordinator.playingId()).toBe(second.id);
    expect(a.pause).toHaveBeenCalled();
  });

  it("suspend pauses everything, resume arbitrates again", () => {
    const a = player();
    const handle = coordinator.register(a);
    handle.report(0.9, 100);

    coordinator.suspend("lightbox");
    expect(coordinator.playingId()).toBeNull();
    expect(a.pause).toHaveBeenCalled();

    coordinator.resume("lightbox");
    expect(coordinator.playingId()).toBe(handle.id);
  });

  it("stays suspended until EVERY reason is resumed", () => {
    const a = player();
    const handle = coordinator.register(a);
    handle.report(0.9, 100);

    coordinator.suspend("lightbox");
    coordinator.suspend("hidden");
    coordinator.resume("lightbox");
    expect(coordinator.playingId()).toBeNull();

    coordinator.resume("hidden");
    expect(coordinator.playingId()).toBe(handle.id);
  });

  it("pauses everything when the tab becomes hidden and resumes when visible", () => {
    const a = player();
    const handle = coordinator.register(a);
    handle.report(0.9, 100);

    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(coordinator.playingId()).toBeNull();

    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(coordinator.playingId()).toBe(handle.id);
  });

  it("unregister removes the player and promotes the next one", () => {
    const a = player();
    const b = player();
    const first = coordinator.register(a);
    const second = coordinator.register(b);
    first.report(0.9, 100);
    second.report(0.7, 600);

    first.unregister();

    expect(coordinator.playingId()).toBe(second.id);
    expect(coordinator.size()).toBe(1);
  });

  it("does not call play twice for the same winner", () => {
    const a = player();
    const handle = coordinator.register(a);

    handle.report(0.9, 100);
    handle.report(0.95, 100);
    handle.report(1, 100);

    expect(a.play).toHaveBeenCalledTimes(1);
  });

  it("reduced motion: nothing autoplays, an explicit user play still works", () => {
    const quiet = createVideoCoordinator({ reducedMotion: () => true });
    const a = player();
    const handle = quiet.register(a);

    handle.report(1, 100);
    expect(a.play).not.toHaveBeenCalled();

    handle.userPlayed();
    expect(a.play).toHaveBeenCalledTimes(1);
  });
});

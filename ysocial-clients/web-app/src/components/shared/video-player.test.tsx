import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";

import { useUIStore } from "@/lib/store/ui-store";
import { createVideoCoordinator } from "@/lib/media/video-coordinator";

import { VideoPlayer } from "./video-player";

// A controllable IntersectionObserver: tests push intersection entries by hand
type ObserverCallback = (entries: Partial<IntersectionObserverEntry>[]) => void;
const observers: { callback: ObserverCallback; element?: Element }[] = [];

class FakeIntersectionObserver {
  private readonly record: { callback: ObserverCallback; element?: Element };

  constructor(callback: ObserverCallback) {
    this.record = { callback };
    observers.push(this.record);
  }

  observe(element: Element) {
    this.record.element = element;
  }

  unobserve() {}
  disconnect() {
    observers.splice(observers.indexOf(this.record), 1);
  }

  takeRecords() {
    return [];
  }
}

const see = (index: number, ratio: number, top = 100) =>
  act(() => {
    const record = observers[index];
    record.callback([{ intersectionRatio: ratio, boundingClientRect: { top } as DOMRectReadOnly, target: record.element }]);
  });

const SRC = "https://res.cloudinary.com/demo/video/upload/v1/ysocial/dev/posts/a.mp4";
const POSTER = "https://res.cloudinary.com/demo/video/upload/so_0/v1/ysocial/dev/posts/a.jpg";

describe("VideoPlayer", () => {
  let play: Mock<() => Promise<void>>;
  let pause: Mock<() => void>;

  beforeEach(() => {
    observers.length = 0;
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
    play = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    pause = vi.fn<() => void>();
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(play);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(pause);
    useUIStore.setState({ videoMuted: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders an inline looping video with metadata preload and the poster", () => {
    const { container } = render(<VideoPlayer src={SRC} poster={POSTER} width={1280} height={720} />);

    const video = container.querySelector("video")!;
    expect(video.getAttribute("src")).toBe(SRC);
    expect(video.getAttribute("poster")).toBe(POSTER);
    expect(video.loop).toBe(true);
    expect(video.getAttribute("preload")).toBe("metadata");
    expect(video.hasAttribute("playsinline")).toBe(true);
    expect(video.controls).toBe(false);
  });

  it("reserves the box from width and height (no layout shift), ratio clamped to 4:5..16:9", () => {
    const wide = render(<VideoPlayer src={SRC} width={4000} height={1000} />);
    expect(wide.container.firstElementChild).toHaveClass("aspect-video");
    wide.unmount();

    const tall = render(<VideoPlayer src={SRC} width={500} height={2000} />);
    expect(tall.container.firstElementChild).toHaveClass("aspect-[4/5]");
  });

  it("autoplays once at least 60% is visible, muted by default", () => {
    const { container } = render(<VideoPlayer src={SRC} width={16} height={9} />);

    see(0, 0.5);
    expect(play).not.toHaveBeenCalled();

    see(0, 0.7);

    expect(play).toHaveBeenCalledTimes(1);
    expect(container.querySelector("video")!.muted).toBe(true);
  });

  it("pauses when it scrolls out of view", () => {
    render(<VideoPlayer src={SRC} width={16} height={9} />);
    see(0, 0.9);

    see(0, 0.1);

    expect(pause).toHaveBeenCalled();
  });

  it("the mute button is a toggle with aria-pressed and flips the session preference", () => {
    const { container } = render(<VideoPlayer src={SRC} width={16} height={9} />);
    const button = screen.getByRole("button", { name: "Bật tiếng" });
    expect(button).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(button);

    expect(useUIStore.getState().videoMuted).toBe(false);
    expect(screen.getByRole("button", { name: "Tắt tiếng" })).toHaveAttribute("aria-pressed", "false");
    expect(container.querySelector("video")!.muted).toBe(false);
  });

  it("every player follows the preference, so the NEXT video scrolled into view has the chosen sound", () => {
    const { container } = render(
      <>
        <VideoPlayer src={SRC} width={16} height={9} />
        <VideoPlayer src={SRC} width={16} height={9} />
      </>,
    );

    act(() => useUIStore.getState().actions.setVideoMuted(false));

    for (const video of container.querySelectorAll("video")) expect(video.muted).toBe(false);
  });

  it("a rejected play() is swallowed and falls back to muted WITHOUT touching the stored preference", async () => {
    useUIStore.setState({ videoMuted: false });
    play.mockRejectedValueOnce(new DOMException("blocked", "NotAllowedError"));
    const { container } = render(<VideoPlayer src={SRC} width={16} height={9} />);

    see(0, 0.9);
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.querySelector("video")!.muted).toBe(true);
    expect(useUIStore.getState().videoMuted).toBe(false);
  });

  it("clicking the video pauses it and the pause sticks until it leaves and re-enters the view", () => {
    const { container } = render(<VideoPlayer src={SRC} width={16} height={9} />);
    see(0, 0.9);
    play.mockClear();

    fireEvent.click(container.querySelector("video")!);
    see(0, 0.95);
    expect(play).not.toHaveBeenCalled();

    see(0, 0.1);
    see(0, 0.9);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("only the most visible of two videos plays", () => {
    render(
      <>
        <VideoPlayer src={SRC} width={16} height={9} />
        <VideoPlayer src={SRC} width={16} height={9} />
      </>,
    );

    see(0, 0.65, 100);
    see(1, 0.95, 500);

    expect(play).toHaveBeenCalledTimes(2);
    expect(pause).toHaveBeenCalled();
  });

  it("unmounting unregisters the player from the coordinator", () => {
    const { unmount } = render(<VideoPlayer src={SRC} width={16} height={9} />);
    see(0, 0.9);
    pause.mockClear();

    unmount();

    expect(observers).toHaveLength(0);
  });

  it("with reduced motion nothing autoplays and a play button starts it", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), addEventListener() {}, removeEventListener() {} }));
    render(<VideoPlayer src={SRC} width={16} height={9} coordinator={createVideoCoordinator()} />);

    see(0, 1);
    expect(play).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Phát" }));
    expect(play).toHaveBeenCalledTimes(1);
  });
});

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { videoCoordinator } from "@/lib/media/video-coordinator";

import type { PostMediaItem } from "../types";
import { PostLightbox } from "./post-lightbox";

const image = (n: number): PostMediaItem => ({ kind: "image", url: `/img-${n}.jpg`, width: 800, height: 600 });
const video: PostMediaItem = { kind: "video", url: "https://res.cloudinary.com/demo/video/upload/v1/a.mp4", posterUrl: "https://x/p.jpg", width: 1280, height: 720 };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PostLightbox", () => {
  it("is closed when the index is null", () => {
    render(<PostLightbox items={[image(1)]} index={null} onIndexChange={() => {}} onClose={() => {}} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the image at the index with the counter and pages with wrap-around", async () => {
    const onIndexChange = vi.fn();
    render(<PostLightbox items={[image(1), image(2), image(3)]} index={2} onIndexChange={onIndexChange} onClose={() => {}} />);

    expect(screen.getByRole("img", { name: "Full resolution viewer" }).getAttribute("src")).toBe("/img-3.jpg");
    expect(screen.getByText("3 / 3")).toBeInTheDocument();

    const buttons = within(screen.getByRole("dialog")).getAllByRole("button");
    await userEvent.click(buttons[buttons.length - 1]);

    expect(onIndexChange).toHaveBeenCalledWith(0);
  });

  it("plays a video with controls instead of an image", () => {
    render(<PostLightbox items={[image(1), video]} index={1} onIndexChange={() => {}} onClose={() => {}} />);

    const element = screen.getByRole("dialog").querySelector("video")!;
    expect(element.getAttribute("src")).toBe(video.url);
    expect(element.controls).toBe(true);
    expect(element.getAttribute("poster")).toBe("https://x/p.jpg");
    expect(screen.queryByRole("img", { name: "Full resolution viewer" })).not.toBeInTheDocument();
  });

  it("suspends the feed videos while open and resumes them when closed", () => {
    const suspend = vi.spyOn(videoCoordinator(), "suspend");
    const resume = vi.spyOn(videoCoordinator(), "resume");
    const { rerender } = render(<PostLightbox items={[image(1)]} index={0} onIndexChange={() => {}} onClose={() => {}} />);
    expect(suspend).toHaveBeenCalledWith("lightbox");

    rerender(<PostLightbox items={[image(1)]} index={null} onIndexChange={() => {}} onClose={() => {}} />);

    expect(resume).toHaveBeenCalledWith("lightbox");
  });

  it("resumes the feed videos when it unmounts while open", () => {
    const resume = vi.spyOn(videoCoordinator(), "resume");
    const { unmount } = render(<PostLightbox items={[image(1)]} index={0} onIndexChange={() => {}} onClose={() => {}} />);

    unmount();

    expect(resume).toHaveBeenCalledWith("lightbox");
  });
});

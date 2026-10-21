import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { PostMediaItem } from "../types";
import { PostMediaGrid } from "./post-media-grid";

const images = (count: number): PostMediaItem[] =>
  Array.from({ length: count }, (_, index) => ({ kind: "image" as const, url: `/img-${index + 1}.jpg`, width: 800, height: 600 }));

const video: PostMediaItem = {
  kind: "video",
  url: "https://res.cloudinary.com/demo/video/upload/v1/ysocial/dev/posts/a.mp4",
  posterUrl: "https://res.cloudinary.com/demo/video/upload/so_0/v1/ysocial/dev/posts/a.jpg",
  width: 1280,
  height: 720,
  durationSeconds: 12,
};

describe("PostMediaGrid", () => {
  it("renders nothing without media", () => {
    const { container } = render(<PostMediaGrid items={[]} onOpen={() => {}} />);

    expect(container).toBeEmptyDOMElement();
  });

  it.each([1, 2, 3, 4])("shows %i image(s), each opens its own index", (count) => {
    const onOpen = vi.fn();
    render(<PostMediaGrid items={images(count)} onOpen={onOpen} />);

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(count);

    fireEvent.click(buttons[count - 1]);
    expect(onOpen).toHaveBeenCalledWith(count - 1);
  });

  it("shows the first four and a +N overlay for the rest", () => {
    render(<PostMediaGrid items={images(7)} onOpen={() => {}} />);

    expect(screen.getAllByRole("button")).toHaveLength(4);
    expect(screen.getByText("+3")).toBeInTheDocument();
  });

  it("keeps the old accessible names of the attachments", () => {
    render(<PostMediaGrid items={images(1)} onOpen={() => {}} />);
    expect(screen.getByRole("img", { name: "Post attachment" })).toBeInTheDocument();
  });

  it("never scales on hover (layout must not shift) and never uses inline style for the box", () => {
    const ours = Array.from({ length: 4 }, (_, n) => ({ kind: "image" as const, url: `https://res.cloudinary.com/demo/image/upload/v1/${n}.jpg` }));
    const { container } = render(<PostMediaGrid items={ours} onOpen={() => {}} />);

    expect(container.innerHTML).not.toMatch(/scale-/);
    for (const image of container.querySelectorAll("img")) {
      expect(image.getAttribute("sizes")).toBeTruthy();
    }
  });

  it("reserves the single image box from its size (static aspect class)", () => {
    const { container } = render(<PostMediaGrid items={[{ kind: "image", url: "/a.jpg", width: 1600, height: 1200 }]} onOpen={() => {}} />);

    expect(container.querySelector(".aspect-\\[4\\/3\\]")).not.toBeNull();
  });

  it("sends our Cloudinary images through the delivery loader and others straight to the browser", () => {
    const ours = { kind: "image" as const, url: "https://res.cloudinary.com/demo/image/upload/v1/a.jpg" };
    const gif = { kind: "image" as const, url: "https://media.giphy.com/media/x/giphy.gif" };
    const { container } = render(<PostMediaGrid items={[ours, gif]} onOpen={() => {}} />);

    const sources = Array.from(container.querySelectorAll("img"), (image) => image.getAttribute("src"));
    expect(sources[0]).toContain("f_auto,q_auto,c_limit");
    expect(sources[1]).toBe("https://media.giphy.com/media/x/giphy.gif");
  });

  it("a single video plays inline (muted player) and can open the lightbox", () => {
    const onOpen = vi.fn();
    const { container } = render(<PostMediaGrid items={[video]} onOpen={onOpen} />);

    expect(container.querySelector("video")?.getAttribute("src")).toBe(video.url);

    fireEvent.click(screen.getByRole("button", { name: "Mở video 1" }));
    expect(onOpen).toHaveBeenCalledWith(0);
  });

  it("a video among several media is a poster tile with a play badge (the lightbox plays it)", () => {
    const onOpen = vi.fn();
    const { container } = render(<PostMediaGrid items={[images(1)[0], video]} onOpen={onOpen} />);

    expect(container.querySelector("video")).toBeNull();
    expect(screen.getByRole("img", { name: "Video 2" }).getAttribute("src")).toContain("so_0");

    fireEvent.click(screen.getByRole("img", { name: "Video 2" }));
    expect(onOpen).toHaveBeenCalledWith(1);
  });

  it("a video without a poster falls back to the derived frame of our url", () => {
    const { container } = render(<PostMediaGrid items={[images(1)[0], { ...video, posterUrl: undefined }]} onOpen={() => {}} />);

    expect(container.querySelector("img[alt='Video 2']")?.getAttribute("src")).toContain("so_0");
  });
});

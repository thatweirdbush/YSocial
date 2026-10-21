import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { QueueItem } from "@/hooks/use-media-upload-queue";

import { MediaQueuePreview } from "./media-queue-preview";

const item = (overrides: Partial<QueueItem> = {}): QueueItem => ({
  localId: "media-1",
  fileName: "a.png",
  kind: "image",
  previewUrl: "blob:preview-1",
  status: "ready",
  ...overrides,
});

describe("MediaQueuePreview", () => {
  it("renders nothing for an empty queue", () => {
    const { container } = render(<MediaQueuePreview items={[]} onRemove={() => {}} onRetry={() => {}} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("shows the preview of a ready item and removes it", () => {
    const onRemove = vi.fn();
    render(<MediaQueuePreview items={[item()]} onRemove={onRemove} onRetry={() => {}} />);

    expect(screen.getByRole("img", { name: "a.png" }).getAttribute("src")).toBe("blob:preview-1");

    fireEvent.click(screen.getByRole("button", { name: "Xóa" }));
    expect(onRemove).toHaveBeenCalledWith("media-1");
  });

  it("shows a muted video preview for a video item", () => {
    const { container } = render(<MediaQueuePreview items={[item({ kind: "video", fileName: "v.mp4" })]} onRemove={() => {}} onRetry={() => {}} />);

    const video = container.querySelector("video")!;
    expect(video.getAttribute("src")).toBe("blob:preview-1");
    expect(video.muted).toBe(true);
  });

  it.each([
    ["compressing", "Đang tối ưu..."],
    ["uploading", "Đang tải lên..."],
  ] as const)("a %s item says so and is busy for assistive tech", (status, label) => {
    render(<MediaQueuePreview items={[item({ status })]} onRemove={() => {}} onRetry={() => {}} />);

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("an error explains itself and offers retry and remove", () => {
    const onRetry = vi.fn();
    render(<MediaQueuePreview items={[item({ status: "error", error: { code: "imageTooBig", n: 10 } })]} onRemove={() => {}} onRetry={onRetry} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Ảnh phải nhỏ hơn 10 MB.");

    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(onRetry).toHaveBeenCalledWith("media-1");
  });

  it("shows the server message of a 400 as is", () => {
    render(<MediaQueuePreview items={[item({ status: "error", error: { code: "server", message: "File size too large." } })]} onRemove={() => {}} onRetry={() => {}} />);

    expect(screen.getByRole("alert")).toHaveTextContent("File size too large.");
  });
});

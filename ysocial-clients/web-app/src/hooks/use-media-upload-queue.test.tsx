import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api-error";
import { MIB } from "@/lib/media/media-limits";
import type { UploadedMedia } from "@/lib/media/media-api";

import { useMediaUploadQueue } from "./use-media-upload-queue";

const api = vi.hoisted(() => ({ uploadMedia: vi.fn(), discardMedia: vi.fn() }));
const compress = vi.hoisted(() => ({ compressImage: vi.fn() }));

vi.mock("@/lib/media/media-api", () => api);
vi.mock("@/lib/media/compress-image", () => compress);

const file = (name: string, type = "image/png", size = 1000) => {
  const created = new File(["x"], name, { type });
  Object.defineProperty(created, "size", { value: size });
  return created;
};

const uploaded = (id: string, extra: Partial<UploadedMedia> = {}): UploadedMedia => ({
  id,
  kind: "image",
  url: `https://res.cloudinary.com/demo/image/upload/v1/${id}.jpg`,
  width: 10,
  height: 10,
  bytes: 100,
  ...extra,
});

const problem = (status: number, code: string) => new ApiError({ kind: "http", status, code, detail: "x" });

describe("useMediaUploadQueue", () => {
  let created: string[];

  beforeEach(() => {
    created = [];
    let counter = 0;
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => `blob:preview-${++counter}`), revokeObjectURL: vi.fn((url: string) => created.push(url)) }));
    compress.compressImage.mockImplementation(async (input: File) => input);
    api.uploadMedia.mockImplementation(async (input: File) => uploaded(`id-${input.name}`));
    api.discardMedia.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  const setup = (purpose: "post" | "avatar" = "post", onReject = vi.fn()) => ({ ...renderHook(() => useMediaUploadQueue({ purpose, onReject })), onReject });

  it("shows a preview at once, then uploads and exposes the media ids in order", async () => {
    const { result } = setup();

    await act(async () => result.current.addFiles([file("a.png"), file("b.png")]));

    expect(result.current.items.map((i) => i.previewUrl)).toEqual(["blob:preview-1", "blob:preview-2"]);
    await waitFor(() => expect(result.current.items.every((i) => i.status === "ready")).toBe(true));
    expect(result.current.mediaIds).toEqual(["id-a.png", "id-b.png"]);
    expect(result.current.isBusy).toBe(false);
  });

  it("uploads sequentially (one request in flight) with the chosen purpose", async () => {
    let inFlight = 0;
    let peak = 0;
    api.uploadMedia.mockImplementation(async (input: File) => {
      peak = Math.max(peak, ++inFlight);
      await Promise.resolve();
      inFlight--;
      return uploaded(`id-${input.name}`);
    });
    const { result } = setup("avatar");

    await act(async () => result.current.addFiles([file("a.png"), file("b.png"), file("c.png")]));
    await waitFor(() => expect(result.current.mediaIds).toHaveLength(3));

    expect(peak).toBe(1);
    expect(api.uploadMedia).toHaveBeenCalledWith(expect.any(File), "avatar", expect.anything());
  });

  it("is busy while compressing or uploading (submit must wait)", async () => {
    let release: (media: UploadedMedia) => void = () => {};
    api.uploadMedia.mockImplementation(() => new Promise<UploadedMedia>((resolve) => (release = resolve)));
    const { result } = setup();

    await act(async () => result.current.addFiles([file("a.png")]));
    await waitFor(() => expect(result.current.items[0].status).toBe("uploading"));
    expect(result.current.isBusy).toBe(true);
    expect(result.current.mediaIds).toEqual([]);

    await act(async () => release(uploaded("id-a")));
    await waitFor(() => expect(result.current.isBusy).toBe(false));
  });

  it("uploads the COMPRESSED file for images and the original for videos", async () => {
    const small = file("small.webp", "image/webp", 10);
    compress.compressImage.mockResolvedValue(small);
    const { result } = setup();

    await act(async () => result.current.addFiles([file("big.jpg", "image/jpeg", 5 * MIB), file("v.mp4", "video/mp4", 5 * MIB)]));
    await waitFor(() => expect(result.current.mediaIds).toHaveLength(2));

    expect(api.uploadMedia.mock.calls[0][0]).toBe(small);
    expect(api.uploadMedia.mock.calls[1][0].name).toBe("v.mp4");
    expect(compress.compressImage).toHaveBeenCalledTimes(1);
  });

  describe("limits (client mirror of the BE table)", () => {
    it("rejects an unsupported type with a message and never queues it", async () => {
      const { result, onReject } = setup();

      await act(async () => result.current.addFiles([file("x.heic", "image/heic")]));

      expect(onReject).toHaveBeenCalledWith({ code: "unsupported" });
      expect(result.current.items).toHaveLength(0);
    });

    it("rejects files beyond 10", async () => {
      const { result, onReject } = setup();
      const eleven = Array.from({ length: 11 }, (_, n) => file(`${n}.png`));

      await act(async () => result.current.addFiles(eleven));

      expect(result.current.items).toHaveLength(10);
      expect(onReject).toHaveBeenCalledWith({ code: "tooMany", n: 10 });
    });

    it("rejects a video over 100 MiB", async () => {
      const { result, onReject } = setup();

      await act(async () => result.current.addFiles([file("v.mp4", "video/mp4", 100 * MIB + 1)]));

      expect(onReject).toHaveBeenCalledWith({ code: "videoTooBig", n: 100 });
      expect(result.current.items).toHaveLength(0);
    });

    it("fails an image that is still over 10 MiB after compression, without uploading it", async () => {
      compress.compressImage.mockImplementation(async (input: File) => input);
      const { result } = setup();

      await act(async () => result.current.addFiles([file("huge.gif", "image/gif", 11 * MIB)]));

      await waitFor(() => expect(result.current.items[0].status).toBe("error"));
      expect(result.current.items[0].error).toEqual({ code: "imageTooBig", n: 10 });
      expect(api.uploadMedia).not.toHaveBeenCalled();
    });

    it("fails a file that would push the request set over 100 MiB in total", async () => {
      const { result } = setup();

      await act(async () => result.current.addFiles([file("a.mp4", "video/mp4", 60 * MIB), file("b.mp4", "video/mp4", 41 * MIB)]));

      await waitFor(() => expect(result.current.items.every((i) => i.status !== "compressing" && i.status !== "uploading")).toBe(true));
      expect(result.current.items.map((i) => i.status)).toEqual(["ready", "error"]);
      expect(result.current.items[1].error).toEqual({ code: "aggregateTooBig", n: 100 });
    });
  });

  describe("errors", () => {
    it("503 marks the item failed and flags the queue as unavailable (text posting keeps working)", async () => {
      api.uploadMedia.mockRejectedValue(problem(503, "MediaStorageUnavailable"));
      const { result } = setup();

      await act(async () => result.current.addFiles([file("a.png")]));
      await waitFor(() => expect(result.current.items[0].status).toBe("error"));

      expect(result.current.unavailable).toBe(true);
      expect(result.current.mediaIds).toEqual([]);
    });

    it("429 is a busy error that retry can fix", async () => {
      api.uploadMedia.mockRejectedValueOnce(problem(429, "TooManyRequests"));
      const { result } = setup();

      await act(async () => result.current.addFiles([file("a.png")]));
      await waitFor(() => expect(result.current.items[0].status).toBe("error"));
      expect(result.current.items[0].error).toEqual({ code: "busy" });

      await act(async () => result.current.retry(result.current.items[0].localId));
      await waitFor(() => expect(result.current.items[0].status).toBe("ready"));
      expect(result.current.mediaIds).toEqual(["id-a.png"]);
    });

    it("a 400 shows the server message and can be removed", async () => {
      api.uploadMedia.mockRejectedValue(new ApiError({ kind: "http", status: 400, code: "ValidationFailed", detail: "File size too large." }));
      const { result } = setup();

      await act(async () => result.current.addFiles([file("a.png")]));
      await waitFor(() => expect(result.current.items[0].status).toBe("error"));

      expect(result.current.items[0].error).toEqual({ code: "server", message: "File size too large." });
      expect(result.current.hasError).toBe(true);

      act(() => result.current.remove(result.current.items[0].localId));
      expect(result.current.items).toHaveLength(0);
      expect(api.discardMedia).not.toHaveBeenCalled();
    });

    it("an error does not stop the next files", async () => {
      api.uploadMedia.mockRejectedValueOnce(problem(500, "InternalError")).mockImplementation(async (input: File) => uploaded(`id-${input.name}`));
      const { result } = setup();

      await act(async () => result.current.addFiles([file("a.png"), file("b.png")]));
      await waitFor(() => expect(result.current.items[1].status).toBe("ready"));

      expect(result.current.items[0].status).toBe("error");
    });
  });

  describe("discard", () => {
    it("removing a ready item discards it on the BE (best effort) and revokes the preview", async () => {
      const { result } = setup();
      await act(async () => result.current.addFiles([file("a.png")]));
      await waitFor(() => expect(result.current.mediaIds).toHaveLength(1));
      const { localId, previewUrl } = result.current.items[0];

      act(() => result.current.remove(localId));

      expect(api.discardMedia).toHaveBeenCalledWith("id-a.png");
      expect(created).toContain(previewUrl);
      expect(result.current.items).toHaveLength(0);
    });

    it("removing an item that is still uploading aborts it and discards the asset if the answer arrives later", async () => {
      let release: (media: UploadedMedia) => void = () => {};
      let signal: AbortSignal | undefined;
      api.uploadMedia.mockImplementation((_file: File, _purpose: string, abort: AbortSignal) => {
        signal = abort;
        return new Promise<UploadedMedia>((resolve) => (release = resolve));
      });
      const { result } = setup();
      await act(async () => result.current.addFiles([file("a.png")]));
      await waitFor(() => expect(result.current.items[0].status).toBe("uploading"));

      act(() => result.current.remove(result.current.items[0].localId));
      expect(signal?.aborted).toBe(true);

      await act(async () => release(uploaded("late")));
      expect(api.discardMedia).toHaveBeenCalledWith("late");
      expect(result.current.items).toHaveLength(0);
    });

    it("discardAll removes every ready asset on the BE", async () => {
      const { result } = setup();
      await act(async () => result.current.addFiles([file("a.png"), file("b.png")]));
      await waitFor(() => expect(result.current.mediaIds).toHaveLength(2));

      act(() => result.current.discardAll());

      expect(api.discardMedia).toHaveBeenCalledTimes(2);
      expect(result.current.items).toHaveLength(0);
    });

    it("clear (after a successful post) drops the items WITHOUT discarding the now attached assets", async () => {
      const { result } = setup();
      await act(async () => result.current.addFiles([file("a.png")]));
      await waitFor(() => expect(result.current.mediaIds).toHaveLength(1));

      act(() => result.current.clear());

      expect(api.discardMedia).not.toHaveBeenCalled();
      expect(result.current.items).toHaveLength(0);
    });

    it("discards ready assets with keepalive when the page is hidden for good", async () => {
      const { result } = setup();
      await act(async () => result.current.addFiles([file("a.png")]));
      await waitFor(() => expect(result.current.mediaIds).toHaveLength(1));

      act(() => {
        window.dispatchEvent(new Event("pagehide"));
      });

      expect(api.discardMedia).toHaveBeenCalledWith("id-a.png", { keepalive: true });
    });

    it("revokes every preview on unmount", async () => {
      const { result, unmount } = setup();
      await act(async () => result.current.addFiles([file("a.png")]));
      const preview = result.current.items[0].previewUrl;

      unmount();

      expect(created).toContain(preview);
    });
  });
});

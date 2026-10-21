import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { compressImage } from "./compress-image";

const KB = 1024;

const original = (type = "image/jpeg", size = 2000 * KB, name = "photo.jpg") => {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
};

/** Canvas whose toBlob answers a blob of the wanted type & size (or null). */
function stubCanvas(result: { type: string; size: number } | null) {
  const toBlob = vi.fn((callback: BlobCallback) => {
    if (!result) return callback(null);
    const blob = new Blob(["y"], { type: result.type });
    Object.defineProperty(blob, "size", { value: result.size });
    callback(blob);
  });
  const context = { drawImage: vi.fn() };
  vi.spyOn(document, "createElement").mockImplementation(((tag: string) =>
    tag === "canvas" ? ({ width: 0, height: 0, getContext: () => context, toBlob } as unknown as HTMLCanvasElement) : document.createElementNS("http://www.w3.org/1999/xhtml", tag)) as typeof document.createElement);
  return { toBlob, context };
}

function stubBitmap(width: number, height: number) {
  const createImageBitmap = vi.fn().mockResolvedValue({ width, height, close: vi.fn() });
  vi.stubGlobal("createImageBitmap", createImageBitmap);
  return createImageBitmap;
}

describe("compressImage", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("re-encodes a large photo as webp (quality 0.82) with orientation honored", async () => {
    const bitmap = stubBitmap(1000, 800);
    const { toBlob } = stubCanvas({ type: "image/webp", size: 300 * KB });
    const file = original();

    const result = await compressImage(file);

    expect(bitmap).toHaveBeenCalledWith(file, { imageOrientation: "from-image" });
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), "image/webp", 0.82);
    expect(result).not.toBe(file);
    expect(result.type).toBe("image/webp");
    expect(result.name).toBe("photo.webp");
  });

  it("scales the longest side down to 2048", async () => {
    stubBitmap(4096, 2048);
    const canvases: { width: number; height: number }[] = [];
    const toBlob = vi.fn((callback: BlobCallback) => callback(new Blob(["y"], { type: "image/webp" })));
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
      if (tag !== "canvas") return document.createElementNS("http://www.w3.org/1999/xhtml", tag);
      const canvas = { width: 0, height: 0, getContext: () => ({ drawImage: vi.fn() }), toBlob };
      canvases.push(canvas);
      return canvas as unknown as HTMLCanvasElement;
    }) as typeof document.createElement);

    await compressImage(original("image/jpeg", 5000 * KB));

    expect(canvases[0]).toMatchObject({ width: 2048, height: 1024 });
  });

  it("never upscales a small picture", async () => {
    stubBitmap(500, 400);
    const canvases: { width: number; height: number }[] = [];
    const toBlob = vi.fn((callback: BlobCallback) => callback(new Blob(["y"], { type: "image/webp" })));
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
      if (tag !== "canvas") return document.createElementNS("http://www.w3.org/1999/xhtml", tag);
      const canvas = { width: 0, height: 0, getContext: () => ({ drawImage: vi.fn() }), toBlob };
      canvases.push(canvas);
      return canvas as unknown as HTMLCanvasElement;
    }) as typeof document.createElement);

    await compressImage(original("image/png", 900 * KB));

    expect(canvases[0]).toMatchObject({ width: 500, height: 400 });
  });

  it.each([
    ["a GIF (animation would be lost)", () => original("image/gif", 5000 * KB, "a.gif")],
    ["a file of 300 KB or less", () => original("image/jpeg", 300 * KB)],
  ])("falls back to the original for %s, without decoding", async (_name, make) => {
    const bitmap = stubBitmap(100, 100);
    const file = make();

    expect(await compressImage(file)).toBe(file);
    expect(bitmap).not.toHaveBeenCalled();
  });

  it("falls back when the browser cannot encode webp (blob type is not webp)", async () => {
    stubBitmap(1000, 800);
    stubCanvas({ type: "image/png", size: 100 * KB });
    const file = original();

    expect(await compressImage(file)).toBe(file);
  });

  it("falls back when the result is not smaller", async () => {
    stubBitmap(1000, 800);
    stubCanvas({ type: "image/webp", size: 3000 * KB });
    const file = original("image/jpeg", 2000 * KB);

    expect(await compressImage(file)).toBe(file);
  });

  it("falls back when toBlob yields nothing", async () => {
    stubBitmap(1000, 800);
    stubCanvas(null);
    const file = original();

    expect(await compressImage(file)).toBe(file);
  });

  it("falls back when decoding throws", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("corrupt")));
    const file = original();

    expect(await compressImage(file)).toBe(file);
  });

  it("falls back when createImageBitmap does not exist", async () => {
    vi.stubGlobal("createImageBitmap", undefined);
    const file = original();

    expect(await compressImage(file)).toBe(file);
  });

  it("falls back when it takes longer than 10 seconds", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("createImageBitmap", vi.fn(() => new Promise(() => {})));
    const file = original();

    const pending = compressImage(file);
    await vi.advanceTimersByTimeAsync(10_001);

    expect(await pending).toBe(file);
  });

  it("closes the decoded bitmap", async () => {
    const close = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 1000, height: 800, close }));
    stubCanvas({ type: "image/webp", size: 100 * KB });

    await compressImage(original());

    expect(close).toHaveBeenCalled();
  });
});

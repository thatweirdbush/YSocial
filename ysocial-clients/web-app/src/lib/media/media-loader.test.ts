import { afterEach, describe, expect, it, vi } from "vitest";

import { cloudinaryLoader, isCloudinaryUrl, posterOf } from "./media-loader";

const IMAGE = "https://res.cloudinary.com/demo/image/upload/v1700000000/ysocial/dev/posts/abc.jpg";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isCloudinaryUrl (same strict parse as the BE OwnsUrl)", () => {
  it.each([
    IMAGE,
    "https://res.cloudinary.com/demo/image/upload/a.jpg",
    "https://res.cloudinary.com/demo/video/upload/v1/ysocial/dev/posts/abc.mp4",
    "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/v1/a.jpg?x=1",
    "https://res.cloudinary.com:443/demo/image/upload/a.jpg",
    "https://RES.CLOUDINARY.COM/demo/image/upload/a.jpg",
  ])("accepts %s", (url) => {
    expect(isCloudinaryUrl(url)).toBe(true);
  });

  it.each([
    "https://res.cloudinary.com.evil.com/demo/image/upload/a.jpg",
    "https://evilres.cloudinary.com/demo/image/upload/a.jpg",
    "https://res.cloudinary.com@evil.com/demo/image/upload/a.jpg",
    "https://user:pw@res.cloudinary.com/demo/image/upload/a.jpg",
    "https://res.cloudinary.com./demo/image/upload/a.jpg",
    "https://res.cloudinary.com:8443/demo/image/upload/a.jpg",
    "http://res.cloudinary.com/demo/image/upload/a.jpg",
    "//res.cloudinary.com/demo/image/upload/a.jpg",
    "ftp://res.cloudinary.com/demo/image/upload/a.jpg",
    "https://res.cloudinary.com/demo/raw/upload/a.jpg",
    "https://res.cloudinary.com/demo/image/fetch/a.jpg",
    "https://res.cloudinary.com/demo/image/upload",
    "https://res.cloudinary.com/demo/image/upload/",
    "https://res.cloudinary.com//demo/image/upload/a.jpg",
    "https://res.cloudinary.com/demo//image/upload/a.jpg",
    "https://res.cloudinary.com/demo/image/upload/../../other/image/upload/a.jpg",
    "https://res.cloudinary.com/demo/image/upload/%2e%2e/a.jpg",
    "https://res.cloudinary.com/demo/image/upload/%2E%2e/a.jpg",
    "https://res.cloudinary.com/demo/image/upload/a%2fb.jpg",
    "https://res.cloudinary.com/demo/image/upload/a%5cb.jpg",
    "https://res.cloudinary.com/demo/image/upload/a\\b.jpg",
    "https://res.cloudinary.com/demo/image/upload/./a.jpg",
    "https://media.giphy.com/media/x/giphy.gif",
    "blob:http://localhost:3000/1234",
    "data:image/png;base64,AAAA",
    "javascript:alert(1)",
    "/relative/a.jpg",
    "not a url",
    "",
  ])("rejects %s", (url) => {
    expect(isCloudinaryUrl(url)).toBe(false);
  });

  it("requires the configured cloud name when NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME is set (case-sensitive)", () => {
    vi.stubEnv("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", "demo");

    expect(isCloudinaryUrl(IMAGE)).toBe(true);
    expect(isCloudinaryUrl("https://res.cloudinary.com/other/image/upload/v1/a.jpg")).toBe(false);
    expect(isCloudinaryUrl("https://res.cloudinary.com/DEMO/image/upload/v1/a.jpg")).toBe(false);
  });

  it("accepts any cloud when the name is not configured", () => {
    vi.stubEnv("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", "");

    expect(isCloudinaryUrl("https://res.cloudinary.com/other/image/upload/v1/a.jpg")).toBe(true);
  });
});

describe("cloudinaryLoader", () => {
  it("inserts the delivery transformation right after /upload/, before the version", () => {
    expect(cloudinaryLoader({ src: IMAGE, width: 640 })).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_640/v1700000000/ysocial/dev/posts/abc.jpg",
    );
  });

  it("inserts it when there is no version either", () => {
    expect(cloudinaryLoader({ src: "https://res.cloudinary.com/demo/image/upload/ysocial/a.jpg", width: 96 })).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_96/ysocial/a.jpg",
    );
  });

  it.each([
    "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/v1/a.jpg",
    "https://res.cloudinary.com/demo/video/upload/so_0/v1/a.jpg",
    "https://res.cloudinary.com/demo/image/upload/w_400/v1/a.jpg",
    "https://res.cloudinary.com/demo/image/upload/c_fill,g_auto,h_100,w_100/v1/a.jpg",
  ])("leaves a url that already has a transformation untouched: %s", (src) => {
    expect(cloudinaryLoader({ src, width: 640 })).toBe(src);
  });

  it("does not mistake a public id folder for a transformation", () => {
    expect(cloudinaryLoader({ src: "https://res.cloudinary.com/demo/image/upload/ysocial/a.jpg", width: 100 })).toContain("w_100/ysocial/a.jpg");
  });

  it("keeps the query string", () => {
    expect(cloudinaryLoader({ src: `${IMAGE}?x=1`, width: 200 })).toMatch(/w_200\/v1700000000\/.*abc\.jpg\?x=1$/);
  });

  it("returns a non-Cloudinary url unchanged (never builds a URL from foreign input)", () => {
    expect(cloudinaryLoader({ src: "https://media.giphy.com/a.gif", width: 100 })).toBe("https://media.giphy.com/a.gif");
  });

  it("ignores the quality argument: q_auto decides", () => {
    expect(cloudinaryLoader({ src: IMAGE, width: 100, quality: 20 })).toContain("q_auto");
  });
});

describe("posterOf", () => {
  it("inserts frame 0 and swaps the extension for a video url", () => {
    expect(posterOf("https://res.cloudinary.com/demo/video/upload/v123/ysocial/dev/posts/abc.mp4")).toBe(
      "https://res.cloudinary.com/demo/video/upload/so_0/v123/ysocial/dev/posts/abc.jpg",
    );
  });

  it("returns undefined for a url that is not ours", () => {
    expect(posterOf("https://example.com/a.mp4")).toBeUndefined();
  });
});

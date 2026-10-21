import { describe, expect, it } from "vitest";

import type { PostMediaItem } from "../types";
import { mediaItemsOf } from "./post-media";

const video: PostMediaItem = { id: "m1", kind: "video", url: "https://res.cloudinary.com/demo/video/upload/v1/a.mp4", posterUrl: "https://x/p.jpg", width: 1280, height: 720 };
const image: PostMediaItem = { id: "m2", kind: "image", url: "https://res.cloudinary.com/demo/image/upload/v1/b.jpg", width: 800, height: 600 };

describe("mediaItemsOf", () => {
  it("prefers the uploaded media, in order", () => {
    expect(mediaItemsOf({ media: [video, image], imageUrls: ["/old.jpg"], imageUrl: "/old.jpg" })).toEqual([video, image]);
  });

  it("falls back to the image url list (mock posts, multi-image drafts)", () => {
    expect(mediaItemsOf({ imageUrls: ["/a.jpg", "/b.jpg"] })).toEqual([
      { kind: "image", url: "/a.jpg" },
      { kind: "image", url: "/b.jpg" },
    ]);
  });

  it("falls back to the single image url (external GIF, legacy posts)", () => {
    expect(mediaItemsOf({ imageUrl: "https://media.giphy.com/x.gif" })).toEqual([{ kind: "image", url: "https://media.giphy.com/x.gif" }]);
  });

  it("an empty media array does not hide the legacy fields", () => {
    expect(mediaItemsOf({ media: [], imageUrl: "/a.jpg" })).toEqual([{ kind: "image", url: "/a.jpg" }]);
  });

  it("is empty for a text post", () => {
    expect(mediaItemsOf({})).toEqual([]);
    expect(mediaItemsOf({ media: [], imageUrls: [] })).toEqual([]);
  });
});

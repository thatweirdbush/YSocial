import { describe, expect, it } from "vitest";

import { ACCEPT_ATTRIBUTE, checkAggregate, checkCandidate, kindOfFile, MEDIA_LIMITS, MIB } from "./media-limits";

const file = (type: string, size = 1000, name = "f") => {
  const created = new File(["x"], name, { type });
  Object.defineProperty(created, "size", { value: size });
  return created;
};

describe("limits mirror the BE table (MiB = 1,048,576)", () => {
  it("has the contract numbers", () => {
    expect(MEDIA_LIMITS).toEqual({ maxFiles: 10, maxImageBytes: 10 * MIB, maxVideoBytes: 100 * MIB, maxAggregateBytes: 100 * MIB });
  });

  it("accepts exactly the types the BE sniffs", () => {
    expect(ACCEPT_ATTRIBUTE.split(",").sort()).toEqual(["image/gif", "image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime", "video/webm"]);
  });
});

describe("kindOfFile", () => {
  it.each([
    ["image/jpeg", "image"],
    ["image/png", "image"],
    ["image/gif", "image"],
    ["image/webp", "image"],
    ["video/mp4", "video"],
    ["video/quicktime", "video"],
    ["video/webm", "video"],
  ])("%s -> %s", (type, kind) => {
    expect(kindOfFile(file(type))).toBe(kind);
  });

  it.each(["image/svg+xml", "image/heic", "image/heif", "image/avif", "application/pdf", "", "video/x-msvideo"])("rejects %j", (type) => {
    expect(kindOfFile(file(type))).toBeNull();
  });
});

describe("checkCandidate", () => {
  it("passes a normal image and video", () => {
    expect(checkCandidate(0, file("image/png"))).toBeNull();
    expect(checkCandidate(0, file("video/mp4", 100 * MIB))).toBeNull();
  });

  it("rejects an unsupported type", () => {
    expect(checkCandidate(0, file("image/heic"))).toEqual({ code: "unsupported" });
  });

  it("rejects the 11th file", () => {
    expect(checkCandidate(9, file("image/png"))).toBeNull();
    expect(checkCandidate(10, file("image/png"))).toEqual({ code: "tooMany", n: 10 });
  });

  it("rejects a video over 100 MiB", () => {
    expect(checkCandidate(0, file("video/mp4", 100 * MIB + 1))).toEqual({ code: "videoTooBig", n: 100 });
  });

  it("does not judge an image by its raw size (it is compressed first)", () => {
    expect(checkCandidate(0, file("image/jpeg", 30 * MIB))).toBeNull();
  });
});

describe("checkAggregate", () => {
  it("allows the sum up to 100 MiB", () => {
    expect(checkAggregate([60 * MIB], 40 * MIB)).toBeNull();
  });

  it("rejects when the sum would exceed 100 MiB", () => {
    expect(checkAggregate([60 * MIB], 40 * MIB + 1)).toEqual({ code: "aggregateTooBig", n: 100 });
  });

  it("rejects an image over 10 MiB after compression", () => {
    expect(checkAggregate([], 10 * MIB + 1, "image")).toEqual({ code: "imageTooBig", n: 10 });
    expect(checkAggregate([], 10 * MIB, "image")).toBeNull();
  });
});

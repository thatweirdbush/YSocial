/** Client mirror of the BE upload limits (MAP 2.10, MiB = 1,048,576): the client rarely hits a 400/413. */

export const MIB = 1024 * 1024;

export const MEDIA_LIMITS = {
  maxFiles: 10,
  maxImageBytes: 10 * MIB,
  maxVideoBytes: 100 * MIB,
  maxAggregateBytes: 100 * MIB,
} as const;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"] as const;

/** `accept` of the file input: exactly what the BE sniffs (SVG, HEIC, AVIF are refused). */
export const ACCEPT_ATTRIBUTE = [...IMAGE_TYPES, ...VIDEO_TYPES].join(",");

export type MediaKindName = "image" | "video";

export type MediaRejection =
  | { code: "unsupported" }
  | { code: "tooMany"; n: number }
  | { code: "videoTooBig"; n: number }
  | { code: "imageTooBig"; n: number }
  | { code: "aggregateTooBig"; n: number };

export function kindOfFile(file: File): MediaKindName | null {
  if ((IMAGE_TYPES as readonly string[]).includes(file.type)) return "image";
  if ((VIDEO_TYPES as readonly string[]).includes(file.type)) return "video";
  return null;
}

/** Checks that need no processing: type, count and the raw size of a video (an image is judged after compression). */
export function checkCandidate(currentCount: number, file: File): MediaRejection | null {
  const kind = kindOfFile(file);
  if (!kind) return { code: "unsupported" };
  if (currentCount >= MEDIA_LIMITS.maxFiles) return { code: "tooMany", n: MEDIA_LIMITS.maxFiles };
  if (kind === "video" && file.size > MEDIA_LIMITS.maxVideoBytes) return { code: "videoTooBig", n: MEDIA_LIMITS.maxVideoBytes / MIB };
  return null;
}

/** Final size checks: an image after compression, and the sum of every file of the request set. */
export function checkAggregate(otherSizes: readonly number[], size: number, kind?: MediaKindName): MediaRejection | null {
  if (kind === "image" && size > MEDIA_LIMITS.maxImageBytes) return { code: "imageTooBig", n: MEDIA_LIMITS.maxImageBytes / MIB };
  if (otherSizes.reduce((sum, item) => sum + item, size) > MEDIA_LIMITS.maxAggregateBytes) {
    return { code: "aggregateTooBig", n: MEDIA_LIMITS.maxAggregateBytes / MIB };
  }
  return null;
}

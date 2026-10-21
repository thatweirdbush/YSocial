const MAX_SIDE = 2048;
const QUALITY = 0.82;
const SKIP_BELOW_BYTES = 300 * 1024;
const TIMEOUT_MS = 10_000;

/** Decode -> scale (longest side <= 2048) -> webp. Any trouble returns `null` and the caller keeps the original. */
async function encode(file: File): Promise<File | null> {
  if (typeof createImageBitmap !== "function") return null;

  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);

    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", QUALITY));
    // A browser without webp encoding answers png: not what we promised
    if (!blob || blob.type !== "image/webp" || blob.size >= file.size) return null;

    return new File([blob], file.name.replace(/\.[^./\\]+$/, "") + ".webp", { type: "image/webp" });
  } finally {
    bitmap.close();
  }
}

/**
 * Client-side image optimization before upload. Falls back to the ORIGINAL file for GIFs (animation), files up to
 * 300 KB, browsers without webp encoding, results that are not smaller, decode failures and anything slower than 10 s.
 * Videos are never re-encoded here.
 */
export async function compressImage(file: File): Promise<File> {
  if (file.type === "image/gif" || file.size <= SKIP_BELOW_BYTES) return file;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), TIMEOUT_MS);
  });

  try {
    return (await Promise.race([encode(file).catch(() => null), timeout])) ?? file;
  } finally {
    clearTimeout(timer);
  }
}

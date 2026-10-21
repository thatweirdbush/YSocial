/**
 * Cloudinary delivery for Next `Image` (MAP 2.10). Only OUR delivery urls are optimized; everything else is rendered
 * `unoptimized` straight from the browser (no `remotePatterns` wildcard: it would turn `/_next/image` into an open proxy).
 */

const HOST = "res.cloudinary.com";
const DELIVERY = "f_auto,q_auto,c_limit";

/** `w_400`, `f_auto,q_auto`, `so_0`, `c_fill,g_auto,h_100,w_100`: every comma part is `<1-3 letters>_<value>`. */
const TRANSFORMATION_SEGMENT = /^[a-z]{1,3}_[^/,]+(,[a-z]{1,3}_[^/,]+)*$/;

/** Path (with leading slash) exactly as given: `URL` would normalize dot segments away; no query or fragment. */
function rawPath(url: string): string | null {
  const start = url.indexOf("://");
  if (start < 0) return null;
  const pathStart = url.indexOf("/", start + 3);
  if (pathStart < 0) return null;
  const end = url.slice(pathStart).search(/[?#]/);
  return end < 0 ? url.slice(pathStart) : url.slice(pathStart, pathStart + end);
}

function hasTrickery(path: string): boolean {
  if (path.includes("\\")) return true;
  const lowered = path.toLowerCase();
  if (lowered.includes("%2e") || lowered.includes("%2f") || lowered.includes("%5c")) return true;
  return path.split("/").some((segment) => segment === "." || segment === "..");
}

/**
 * Same strict parse as the BE `OwnsUrl`: https, no user-info, default port, host exactly `res.cloudinary.com`, then
 * `/{cloud}/{image|video}/upload/{...}`. When `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` is set the cloud must match (case-sensitive).
 */
export function isCloudinaryUrl(src: string | null | undefined): boolean {
  if (!src) return false;

  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return false;
  }

  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hostname !== HOST) return false;

  const path = rawPath(src);
  if (path === null || hasTrickery(path)) return false;

  const segments = path.split("/");
  if (segments.length < 5 || segments[0] !== "" || segments.slice(1).some((segment) => segment === "")) return false;

  const cloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  if (cloud && segments[1] !== cloud) return false;

  return (segments[2] === "image" || segments[2] === "video") && segments[3] === "upload";
}

/** `next/image` loader: `f_auto,q_auto,c_limit,w_{width}` right after `/upload/` (before the version), only when none exists yet. */
export function cloudinaryLoader({ src, width }: { src: string; width: number; quality?: number }): string {
  if (!isCloudinaryUrl(src)) return src;

  const marker = "/upload/";
  const at = src.indexOf(marker) + marker.length;
  const next = src.slice(at).split(/[/?#]/, 1)[0] ?? "";

  if (TRANSFORMATION_SEGMENT.test(next)) return src;

  return `${src.slice(0, at)}${DELIVERY},w_${width}/${src.slice(at)}`;
}

/** Frame 0 of one of OUR video urls as a jpg (the BE sends `posterUrl`; this is the fallback). */
export function posterOf(videoUrl: string): string | undefined {
  if (!isCloudinaryUrl(videoUrl)) return undefined;

  const marker = "/upload/";
  const at = videoUrl.indexOf(marker) + marker.length;
  const withFrame = `${videoUrl.slice(0, at)}so_0/${videoUrl.slice(at)}`;
  const query = withFrame.search(/[?#]/);
  const base = query < 0 ? withFrame : withFrame.slice(0, query);
  const dot = base.lastIndexOf(".");

  return `${dot > base.lastIndexOf("/") ? base.slice(0, dot) : base}.jpg`;
}

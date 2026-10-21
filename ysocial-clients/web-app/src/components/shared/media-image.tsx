"use client";

import Image, { type ImageProps } from "next/image";

import { cloudinaryLoader, isCloudinaryUrl } from "@/lib/media/media-loader";

type MediaImageProps = Omit<ImageProps, "src" | "loader" | "unoptimized"> & { src: string };

/**
 * Next `Image` for every user-facing picture. Our Cloudinary urls get the delivery loader (`f_auto,q_auto,c_limit,w_n`);
 * anything else (blob previews, GIF picker, other hosts) is `unoptimized`: straight from the browser, never through
 * `/_next/image` (no `remotePatterns` wildcard = no open image proxy).
 */
export function MediaImage({ src, alt, ...props }: MediaImageProps) {
  return isCloudinaryUrl(src) ? (
    <Image src={src} alt={alt} loader={cloudinaryLoader} {...props} />
  ) : (
    <Image src={src} alt={alt} unoptimized {...props} />
  );
}

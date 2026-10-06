import type { TagSort } from "@/features/posts/types";

/** Route param -> tag without `#`; null when the encoding is broken or nothing is left. */
export function decodeTagParam(raw: string): string | null {
  try {
    const tag = decodeURIComponent(raw).trim().replace(/^#/, "");
    return tag || null;
  } catch {
    return null;
  }
}

export const isTagSort = (value: unknown): value is TagSort => value === "top" || value === "latest";

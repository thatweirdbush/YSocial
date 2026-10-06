// Text helpers shared by search, highlight & hashtag parsing. Matching is case & diacritics insensitive.

/** `#tag` at start or after whitespace (never URL fragments / ids); letters + combining marks (NFD Vietnamese), digits, `_`. */
export const HASHTAG_PATTERN = /(?<=^|\s)#([\p{L}\p{M}\p{N}_]+)/gu;

/** `@username` at start or after whitespace (usernames are ASCII); a trailing `.` ends the sentence, not the name. */
export const MENTION_PATTERN = /(?<=^|\s)@([a-zA-Z0-9._]*[a-zA-Z0-9_])/g;

/** Folds one string without touching whitespace: NFD, strip marks, đ -> d, lowercase. */
export function foldText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase();
}

export function normalizeText(input: string): string {
  return foldText(input).replace(/\s+/g, " ").trim();
}

export function tokenize(input: string): string[] {
  const normalized = normalizeText(input);
  return normalized ? normalized.split(" ") : [];
}

/** Hashtags in order of appearance, without `#`, deduped by normalized form (first casing wins). */
export function extractHashtags(content: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const match of content.matchAll(HASHTAG_PATTERN)) {
    const key = normalizeText(match[1]);
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(match[1]);
  }
  return tags;
}

import { extractHashtags, normalizeText } from "@/lib/text";
import type { HashtagStat, PostItem } from "../types";

/** Match key for a tag: normalized, without leading `#`. */
export const tagKey = (tag: string): string => normalizeText(tag.replace(/^#/, ""));

export const byNewest = (a: PostItem, b: PostItem) => Date.parse(b.createdAt) - Date.parse(a.createdAt);

/**
 * Tag stats over root posts, keyed by `tagKey`. Display casing = most frequent original form;
 * ties -> first seen in newest-first order.
 */
export function collectTagStats(posts: Iterable<PostItem>): Map<string, HashtagStat> {
  const roots = [...posts].filter((post) => post.parentId === undefined).sort(byNewest);
  const casings = new Map<string, Map<string, number>>();

  for (const post of roots) {
    for (const tag of extractHashtags(post.content)) {
      const forms = casings.get(tagKey(tag)) ?? new Map<string, number>();
      forms.set(tag, (forms.get(tag) ?? 0) + 1);
      casings.set(tagKey(tag), forms);
    }
  }

  const stats = new Map<string, HashtagStat>();
  for (const [key, forms] of casings) {
    let tag = "";
    let best = 0;
    let postsCount = 0;
    for (const [form, count] of forms) {
      postsCount += count;
      if (count > best) [tag, best] = [form, count];
    }
    stats.set(key, { tag, postsCount });
  }
  return stats;
}

/** True when `post` carries the tag with match key `key`. */
export const hasTag = (post: PostItem, key: string): boolean =>
  extractHashtags(post.content).some((tag) => tagKey(tag) === key);

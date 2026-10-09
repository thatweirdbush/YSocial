import en from "@/lib/locales/en.json";
import vi from "@/lib/locales/vi.json";
import type { LocaleType } from "@/lib/store/ui-store";

const dictionaries = { vi, en };

// Strict type check for translations keys to get autocomplete and compile safety
export type TranslationKey =
  | `nav.${keyof typeof vi.nav}`
  | `feed.${keyof typeof vi.feed}`
  | `creator.${keyof typeof vi.creator}`
  | `card.${keyof typeof vi.card}`
  | `common.${keyof typeof vi.common}`
  | `profile.${keyof typeof vi.profile}`
  | `notifications.${keyof typeof vi.notifications}`
  | `auth.${keyof typeof vi.auth}`
  | `postDetail.${keyof typeof vi.postDetail}`
  | `search.${keyof typeof vi.search}`
  | `tags.${keyof typeof vi.tags}`
  | `saved.${keyof typeof vi.saved}`
  | `hoverCard.${keyof typeof vi.hoverCard}`
  | `share.${keyof typeof vi.share}`
  | `relations.${keyof typeof vi.relations}`;

/** Pure, server-safe lookup. Unknown keys / non-string leaves resolve to the key itself. */
export function translate(
  locale: LocaleType,
  key: TranslationKey,
  params?: Record<string, string | number>,
): string {
  let value: unknown = dictionaries[locale];
  for (const part of key.split(".")) {
    if (value !== null && typeof value === "object" && part in value) {
      value = (value as Record<string, unknown>)[part];
    } else {
      return key;
    }
  }

  if (typeof value !== "string") {
    return key;
  }

  if (!params) {
    return value;
  }

  let result = value;
  for (const [name, replacement] of Object.entries(params)) {
    result = result.replace(new RegExp(`{${name}}`, "g"), String(replacement));
  }
  return result;
}

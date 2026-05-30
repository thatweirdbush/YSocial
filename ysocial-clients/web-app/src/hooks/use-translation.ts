import vi from "@/lib/locales/vi.json";
import en from "@/lib/locales/en.json";
import { useLocale } from "@/lib/store/ui-store";

const dictionaries = { vi, en };

// Strict type check for translations keys to get autocomplete and compile safety
type TranslationKey =
  | `nav.${keyof typeof vi.nav}`
  | `feed.${keyof typeof vi.feed}`
  | `creator.${keyof typeof vi.creator}`
  | `card.${keyof typeof vi.card}`
  | `common.${keyof typeof vi.common}`
  | `profile.${keyof typeof vi.profile}`
  | `notifications.${keyof typeof vi.notifications}`;

export const useTranslation = () => {
  const locale = useLocale();

  const t = (keyPath: TranslationKey, params?: Record<string, string | number>): string => {
    const dict = dictionaries[locale];
    const parts = keyPath.split(".");

    let value: any = dict;
    for (const part of parts) {
      if (value && typeof value === "object" && part in value) {
        value = value[part];
      } else {
        return keyPath;
      }
    }

    if (typeof value !== "string") {
      return keyPath;
    }

    if (params) {
      let result = value;
      Object.entries(params).forEach(([key, val]) => {
        result = result.replace(new RegExp(`{${key}}`, "g"), String(val));
      });
      return result;
    }

    return value;
  };

  return { t, locale };
};
export type { TranslationKey };

import { translate, type TranslationKey } from "@/lib/i18n/translate";
import { useLocale } from "@/lib/store/ui-store";

export const useTranslation = () => {
  const locale = useLocale();

  const t = (key: TranslationKey, params?: Record<string, string | number>): string =>
    translate(locale, key, params);

  return { t, locale };
};
export type { TranslationKey };

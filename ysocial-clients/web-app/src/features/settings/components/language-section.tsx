"use client";

import { useTranslation } from "@/hooks/use-translation";
import { type LocaleType, useUIActions } from "@/lib/store/ui-store";
import { OptionGroup } from "./option-group";
import { SettingsPageHeader } from "./settings-page-header";

/** Native names: a language is always named in itself so it stays findable after a wrong switch. */
const LANGUAGES: ReadonlyArray<{ value: LocaleType; label: string }> = [
  { value: "vi", label: "Tiếng Việt" },
  { value: "en", label: "English" },
];

/** `/settings/language`: `ui-store` stays the only locale owner. */
export function LanguageSection() {
  const { t, locale } = useTranslation();
  const { setLocale } = useUIActions();

  return (
    <>
      <SettingsPageHeader title="settings.language" />
      <div className="flex flex-col gap-6 p-4">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{t("settings.onThisDevice")}</p>
        <OptionGroup<LocaleType> name="language" legend={t("settings.language")} value={locale} onChange={setLocale} options={LANGUAGES} />
      </div>
    </>
  );
}

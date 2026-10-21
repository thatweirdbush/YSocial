"use client";

import { useTheme } from "next-themes";
import { useTranslation } from "@/hooks/use-translation";
import { type FontSize, type ReducedMotion, useFontSize, useReducedMotion, useSettingsActions } from "../store/settings-store";
import { OptionGroup } from "./option-group";
import { SettingsPageHeader } from "./settings-page-header";

type ThemeChoice = "light" | "dark" | "system";

/** `/settings/appearance`: theme (next-themes), font size & reduced motion (settings-store, per device). */
export function AppearanceSection() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const fontSize = useFontSize();
  const reducedMotion = useReducedMotion();
  const { setFontSize, setReducedMotion } = useSettingsActions();

  return (
    <>
      <SettingsPageHeader title="settings.appearance" />
      <div className="flex flex-col gap-6 p-4">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{t("settings.onThisDevice")}</p>
        <OptionGroup<ThemeChoice>
          name="theme"
          legend={t("settings.theme")}
          value={theme as ThemeChoice | undefined}
          onChange={setTheme}
          options={[
            { value: "light", label: t("settings.themeLight") },
            { value: "dark", label: t("settings.themeDark") },
            { value: "system", label: t("settings.themeSystem") },
          ]}
        />
        <OptionGroup<FontSize>
          name="font-size"
          legend={t("settings.fontSize")}
          value={fontSize}
          onChange={setFontSize}
          options={[
            { value: "sm", label: t("settings.fontSm") },
            { value: "md", label: t("settings.fontMd") },
            { value: "lg", label: t("settings.fontLg") },
          ]}
        />
        <OptionGroup<ReducedMotion>
          name="reduced-motion"
          legend={t("settings.reducedMotion")}
          value={reducedMotion}
          onChange={setReducedMotion}
          options={[
            { value: "system", label: t("settings.motionSystem") },
            { value: "reduce", label: t("settings.motionReduce") },
          ]}
        />
      </div>
    </>
  );
}

import type { LucideIcon } from "lucide-react";
import type { TranslationKey } from "@/hooks/use-translation";

export interface SettingsSection {
  href: string;
  titleKey: TranslationKey;
  icon: LucideIcon;
}

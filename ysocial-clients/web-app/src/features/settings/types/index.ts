import type { LucideIcon } from "lucide-react";
import type { TranslationKey } from "@/hooks/use-translation";
import type { Capability } from "@/lib/capabilities";

export interface SettingsSection {
  href: string;
  titleKey: TranslationKey;
  icon: LucideIcon;
  /** Section is hidden (nav) & shows an unavailable state (route) while this capability is off; absent = always available. */
  capability?: Capability;
}

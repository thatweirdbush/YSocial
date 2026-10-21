import type { LucideIcon } from "lucide-react";
import type { TranslationKey } from "@/hooks/use-translation";
import type { components } from "@/lib/api/generated";
import type { Capability } from "@/lib/capabilities";

// #region Backend DTOs
type Schemas = components["schemas"];

export type SessionDto = Schemas["SessionDto"];
// #endregion

// #region Domain models
/** One sign-in of the account; `id` is the active head token id (changes on rotation). */
export interface SessionItem {
  id: string;
  userAgent: string | null;
  profileUsername: string | null;
  /** Sign-in time. */
  createdAt: string;
  /** Last login / refresh / switch token issue, NOT user activity. */
  lastTokenIssuedAt: string;
  isCurrent: boolean;
}

export interface SettingsSection {
  href: string;
  titleKey: TranslationKey;
  icon: LucideIcon;
  /** Section is hidden (nav) & shows an unavailable state (route) while this capability is off; absent = always available. */
  capability?: Capability;
}
// #endregion

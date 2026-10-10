import { Ban, Lock, Star, VolumeX } from "lucide-react";
import type { SettingsSection } from "./types";

/** Settings sections available now; roadmap 4.1 adds the remaining routes. */
export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  { href: "/settings/privacy", titleKey: "settings.privacy", icon: Lock },
  { href: "/settings/blocked", titleKey: "settings.blocked", icon: Ban },
  { href: "/settings/muted", titleKey: "settings.muted", icon: VolumeX },
  { href: "/settings/close-friends", titleKey: "settings.closeFriends", icon: Star },
];

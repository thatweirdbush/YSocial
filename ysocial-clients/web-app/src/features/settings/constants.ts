import { Ban, Bell, Lock, Star, VolumeX } from "lucide-react";
import type { SettingsSection } from "./types";

/** Settings sections available now; roadmap 4.1 adds the remaining routes. */
export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  { href: "/settings/privacy", titleKey: "settings.privacy", icon: Lock, capability: "privacyUi" },
  { href: "/settings/notifications", titleKey: "settings.notifications", icon: Bell, capability: "notificationSettings" },
  { href: "/settings/blocked", titleKey: "settings.blocked", icon: Ban, capability: "blockUi" },
  { href: "/settings/muted", titleKey: "settings.muted", icon: VolumeX, capability: "muteUi" },
  { href: "/settings/close-friends", titleKey: "settings.closeFriends", icon: Star, capability: "closeFriendsUi" },
];

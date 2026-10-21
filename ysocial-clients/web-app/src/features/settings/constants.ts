import { Ban, Bell, Languages, Lock, MessageSquareText, Monitor, Palette, Star, Timer, TriangleAlert, UserRound, VolumeX } from "lucide-react";
import { hasCapability } from "@/lib/capabilities";
import type { SettingsSection } from "./types";

/** Settings sections available now; roadmap 4.1 adds the remaining routes. */
export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  { href: "/settings/account", titleKey: "settings.account", icon: UserRound, capability: "accountUi" },
  { href: "/settings/privacy", titleKey: "settings.privacy", icon: Lock, capability: "privacyUi" },
  { href: "/settings/notifications", titleKey: "settings.notifications", icon: Bell, capability: "notificationSettings" },
  { href: "/settings/blocked", titleKey: "settings.blocked", icon: Ban, capability: "blockUi" },
  { href: "/settings/muted", titleKey: "settings.muted", icon: VolumeX, capability: "muteUi" },
  { href: "/settings/close-friends", titleKey: "settings.closeFriends", icon: Star, capability: "closeFriendsUi" },
  { href: "/settings/appearance", titleKey: "settings.appearance", icon: Palette },
  { href: "/settings/language", titleKey: "settings.language", icon: Languages },
  { href: "/settings/content", titleKey: "settings.content", icon: MessageSquareText },
  { href: "/settings/time-management", titleKey: "settings.timeManagement", icon: Timer },
  { href: "/settings/sessions", titleKey: "settings.sessions", icon: Monitor, capability: "accountUi" },
  { href: "/settings/danger", titleKey: "settings.danger", icon: TriangleAlert, capability: "accountUi" },
];

/** Sections whose capability is on (a section without capability is always shown); read per call. */
export const visibleSections = (sections: readonly SettingsSection[] = SETTINGS_SECTIONS): SettingsSection[] =>
  sections.filter(({ capability }) => capability === undefined || hasCapability(capability));

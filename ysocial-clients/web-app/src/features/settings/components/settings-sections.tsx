"use client";

import { FeatureUnavailable } from "@/components/shared/feature-unavailable";
import { hasCapability } from "@/lib/capabilities";
import { BlockedUserList, CloseFriendsList, FollowRequestList, MutedUserList } from "@/features/profile";
import { NotificationSettings } from "./notification-settings";
import { PrivacyLinks } from "./privacy-links";
import { PrivacySettings } from "./privacy-settings";
import { SettingsPageHeader } from "./settings-page-header";

/** `/settings/privacy`: the private account switch and the pending follow requests (`#requests`). */
export function PrivacySection() {
  if (!hasCapability("privacyUi")) return <FeatureUnavailable />;
  return (
    <>
      <SettingsPageHeader title="settings.privacy" />
      <PrivacySettings />
      <PrivacyLinks />
      <section id="requests" className="border-t border-zinc-200/60 dark:border-zinc-900/60">
        <FollowRequestList />
      </section>
    </>
  );
}

/** `/settings/notifications`: which kinds of notification arrive (likes, replies, follows). */
export function NotificationsSection() {
  if (!hasCapability("notificationSettings")) return <FeatureUnavailable />;
  return (
    <>
      <SettingsPageHeader title="settings.notifications" />
      <NotificationSettings />
    </>
  );
}

export function BlockedSection() {
  if (!hasCapability("blockUi")) return <FeatureUnavailable />;
  return (
    <>
      <SettingsPageHeader title="settings.blocked" />
      <BlockedUserList />
    </>
  );
}

export function MutedSection() {
  if (!hasCapability("muteUi")) return <FeatureUnavailable />;
  return (
    <>
      <SettingsPageHeader title="settings.muted" />
      <MutedUserList />
    </>
  );
}

export function CloseFriendsSection() {
  if (!hasCapability("closeFriendsUi")) return <FeatureUnavailable />;
  return (
    <>
      <SettingsPageHeader title="settings.closeFriends" />
      <CloseFriendsList />
    </>
  );
}

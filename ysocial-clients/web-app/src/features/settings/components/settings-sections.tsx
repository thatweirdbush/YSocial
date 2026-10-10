"use client";

import { BlockedUserList, CloseFriendsList, FollowRequestList, MutedUserList } from "@/features/profile";
import { PrivacySettings } from "./privacy-settings";
import { SettingsPageHeader } from "./settings-page-header";

/** `/settings/privacy`: the private account switch and the pending follow requests (`#requests`). */
export function PrivacySection() {
  return (
    <>
      <SettingsPageHeader title="settings.privacy" />
      <PrivacySettings />
      <section id="requests" className="border-t border-zinc-200/60 dark:border-zinc-900/60">
        <FollowRequestList />
      </section>
    </>
  );
}

export function BlockedSection() {
  return (
    <>
      <SettingsPageHeader title="settings.blocked" />
      <BlockedUserList />
    </>
  );
}

export function MutedSection() {
  return (
    <>
      <SettingsPageHeader title="settings.muted" />
      <MutedUserList />
    </>
  );
}

export function CloseFriendsSection() {
  return (
    <>
      <SettingsPageHeader title="settings.closeFriends" />
      <CloseFriendsList />
    </>
  );
}

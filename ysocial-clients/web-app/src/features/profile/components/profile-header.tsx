"use client";

import { BadgeCheck, Link2, Lock, QrCode, Share2 } from "lucide-react";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useTranslation } from "@/hooks/use-translation";
import type { FollowListKind, UserProfile } from "../types";
import { parseBio } from "../utils/bio-parser";
import { EditProfileDialog } from "./edit-profile-dialog";
import { FollowButton } from "./follow-button";
import { ProfileHeaderMenu } from "./profile-header-menu";

interface ProfileHeaderProps {
  user: UserProfile;
  isOwn: boolean;
  onOpenFollowers: (kind: FollowListKind) => void;
  /** Share menu is rendered only when provided. */
  onShare?: (action: "copy" | "qr") => void;
  /** False for a locked private profile: the counts stay visible but the follow lists cannot be opened. */
  canOpenLists?: boolean;
}

/** A follower / following count: a button that opens the list, or plain text when the list is locked. */
function CountLink({ enabled, onClick, children }: { enabled: boolean; onClick: () => void; children: React.ReactNode }) {
  if (!enabled) return <span className="px-1">{children}</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-11 cursor-pointer rounded-md px-1 outline-none transition-colors hover:text-zinc-900 hover:underline focus-visible:ring-2 focus-visible:ring-zinc-950 motion-reduce:transition-none dark:hover:text-zinc-100 dark:focus-visible:ring-zinc-100"
    >
      {children}
    </button>
  );
}

export function ProfileHeader({ user, isOwn, onOpenFollowers, onShare, canOpenLists = true }: ProfileHeaderProps) {
  const { t, locale } = useTranslation();
  const [editOpen, setEditOpen] = useState(false);
  const formatCount = (n: number) => new Intl.NumberFormat(locale).format(n);

  return (
    <div className="flex flex-col gap-5 px-4 py-6 md:px-6">
      {/* Identity (left) and avatar (right), Threads style */}
      <div className="flex items-start justify-between gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <h1 className="truncate text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">{user.displayName}</h1>
            {user.isVerified && <BadgeCheck className="size-5 shrink-0 fill-blue-500 text-blue-500" aria-hidden="true" />}
            {user.isPrivate && (
              <Lock role="img" aria-label={t("profile.privateBadge")} className="size-4 shrink-0 text-zinc-500 dark:text-zinc-400" />
            )}
          </div>
          <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">@{user.username}</span>
        </div>

        <Avatar className="size-20 shrink-0 border-2 border-zinc-150 shadow-sm sm:size-24 dark:border-zinc-850">
          <AvatarImage src={user.avatarUrl} alt={user.displayName} />
          <AvatarFallback className="bg-zinc-200 text-xl font-bold dark:bg-zinc-800">{user.displayName.charAt(0)}</AvatarFallback>
        </Avatar>
      </div>

      {user.bio && (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-850 dark:text-zinc-200">{parseBio(user.bio)}</p>
      )}

      <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
        <CountLink enabled={canOpenLists} onClick={() => onOpenFollowers("followers")}>
          {t("profile.followersCount", { n: formatCount(user.followersCount) })}
        </CountLink>
        <span className="select-none text-zinc-300 dark:text-zinc-700" aria-hidden="true">
          •
        </span>
        <CountLink enabled={canOpenLists} onClick={() => onOpenFollowers("following")}>
          {t("profile.followingCount", { n: formatCount(user.followingCount) })}
        </CountLink>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {isOwn ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => setEditOpen(true)}
            className="min-h-11 flex-1 rounded-full border-zinc-250 px-6 text-xs font-bold shadow-sm transition-colors hover:bg-zinc-100 sm:flex-initial dark:border-zinc-800 dark:hover:bg-zinc-900"
          >
            {t("profile.editProfile")}
          </Button>
        ) : (
          <FollowButton userId={user.id} reserveSpace className="min-h-11 flex-1 px-6 text-xs sm:flex-initial" />
        )}

        {!isOwn && <ProfileHeaderMenu user={user} />}

        {onShare && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={t("profile.shareProfile")}
                className="size-11 shrink-0 rounded-full border-zinc-250 shadow-sm hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900"
              >
                <Share2 className="size-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 rounded-2xl p-2">
              <DropdownMenuItem onSelect={() => onShare("copy")} className="min-h-11 cursor-pointer gap-2 rounded-xl">
                <Link2 className="size-4 text-zinc-400" aria-hidden="true" />
                {t("share.copyLink")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onShare("qr")} className="min-h-11 cursor-pointer gap-2 rounded-xl">
                <QrCode className="size-4 text-zinc-400" aria-hidden="true" />
                {t("share.showQr")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {isOwn && <EditProfileDialog open={editOpen} onOpenChange={setEditOpen} user={user} />}
    </div>
  );
}

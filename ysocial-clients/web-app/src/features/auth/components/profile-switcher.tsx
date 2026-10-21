"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useCachedResource } from "@/hooks/use-cached-resource";
import { useTranslation } from "@/hooks/use-translation";
import { hasCapability } from "@/lib/capabilities";
import { useSubmitGuard } from "../hooks/use-submit-guard";
import { authService, fetchMe } from "../services/auth-service";
import { SwitchInProgressError, SwitchSessionLostError, SwitchUnconfirmedError } from "../services/switch-profile";
import { useViewerId } from "../store/auth-store";
import type { ProfileSummary } from "../types";

/** Account menu entries to move the session to another profile of the account. Real BE only. */
export function ProfileSwitcher() {
  if (!hasCapability("profileSwitcher")) return null;
  return <ProfileList />;
}

function ProfileList() {
  const { t } = useTranslation();
  const router = useRouter();
  const viewerId = useViewerId();
  const guard = useSubmitGuard();
  // The menu content mounts when the menu opens: one `GET me` per opening (stale-while-revalidate across openings)
  const { data } = useCachedResource(`profile-switcher:${viewerId}`, fetchMe);
  const others = (data?.profiles ?? []).filter((profile) => profile.id && profile.id !== viewerId);
  if (others.length === 0) return null;

  const handleSelect = async (target: ProfileSummary) => {
    if (!guard.enter()) return;
    try {
      await authService.switchProfile(target);
      // Server components re-render for the new viewer; every client store already followed the viewer change
      router.refresh();
    } catch (error) {
      // Module-level guard: another switch is still running, nothing was sent
      if (error instanceof SwitchInProgressError) return;
      if (error instanceof SwitchSessionLostError) {
        toast.error(t("nav.switchSessionLost"));
        router.push("/login");
      } else if (error instanceof SwitchUnconfirmedError) {
        toast.error(t("nav.switchUnconfirmed"));
      } else {
        // Includes 403 ProfileNotOwned: the next opening of the menu reloads the list
        toast.error(t("nav.switchFailed"));
      }
    } finally {
      guard.leave();
    }
  };

  return (
    <>
      <DropdownMenuSeparator className="bg-zinc-100 dark:bg-zinc-900" />
      <DropdownMenuLabel className="px-3 py-1 text-xs font-semibold text-zinc-400">{t("nav.switchProfile")}</DropdownMenuLabel>
      {others.map((profile) => (
        <DropdownMenuItem
          key={profile.id}
          onSelect={() => void handleSelect(profile)}
          className="cursor-pointer rounded-xl px-3 py-2 focus:bg-zinc-100 dark:focus:bg-zinc-900"
        >
          <Avatar className="size-7 shrink-0 border border-zinc-200 dark:border-zinc-800">
            <AvatarImage src={profile.avatarUrl ?? undefined} alt="" />
            <AvatarFallback className="bg-zinc-200 text-xs font-semibold dark:bg-zinc-800">
              {(profile.displayName ?? profile.username ?? "?").charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">{profile.displayName}</span>
            <span className="truncate text-xs text-zinc-400">@{profile.username}</span>
          </span>
        </DropdownMenuItem>
      ))}
    </>
  );
}

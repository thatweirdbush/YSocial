"use client";

import { Ban, MoreHorizontal, Star, VolumeX } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { GUEST_ACTOR_ID, useActorId } from "@/features/auth";
import { useTranslation } from "@/hooks/use-translation";
import { commitBlock, commitCloseFriend, commitMute } from "../store/relation-store";
import type { UserProfile } from "../types";
import { BlockConfirmDialog } from "./block-confirm-dialog";

const ITEM = "min-h-11 cursor-pointer gap-2 rounded-xl";
const ICON = "size-4 text-zinc-400";

/** Profile header actions on someone else's profile: close friends (accepted follows only), mute, block. */
export function ProfileHeaderMenu({ user }: { user: UserProfile }) {
  const { t } = useTranslation();
  const actorId = useActorId();
  const [blockOpen, setBlockOpen] = useState(false);

  if (actorId === GUEST_ACTOR_ID || actorId === user.id) return null;

  const { id, username } = user;
  const params = { username };
  const fail = () => toast.error(t("relations.actionError"));

  const toggleCloseFriend = () => {
    const next = !user.viewerMarkedCloseFriend;
    void commitCloseFriend(actorId, id, next).then((ok) => {
      if (ok) toast.success(t(next ? "relations.closeFriendAddedToast" : "relations.closeFriendRemovedToast", params));
      else fail();
    });
  };

  const toggleMute = () => {
    const next = !user.isMuted;
    void commitMute(actorId, id, next).then((ok) => {
      if (!ok) fail();
    });
    if (next) {
      toast.info(t("relations.muteToast", params), {
        action: { label: t("relations.undo"), onClick: () => void commitMute(actorId, id, false) },
      });
    } else {
      toast.info(t("relations.unmuteToast", params));
    }
  };

  const block = () => {
    setBlockOpen(false);
    void commitBlock(actorId, id, true).then((ok) => {
      if (ok) toast.success(t("relations.blockedToast", params));
      else fail();
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={t("card.more")}
            className="size-11 shrink-0 rounded-full border-zinc-250 shadow-sm hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900"
          >
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60 rounded-2xl p-2">
          {user.followStatus === "accepted" && (
            <DropdownMenuItem onSelect={toggleCloseFriend} className={ITEM}>
              <Star className={ICON} aria-hidden="true" />
              {t(user.viewerMarkedCloseFriend ? "relations.removeCloseFriend" : "relations.addCloseFriend")}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={toggleMute} className={ITEM}>
            <VolumeX className={ICON} aria-hidden="true" />
            {user.isMuted ? t("relations.unmute", params) : t("card.mute", params)}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setBlockOpen(true)} className={ITEM}>
            <Ban className={ICON} aria-hidden="true" />
            {t("card.block", params)}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <BlockConfirmDialog open={blockOpen} onOpenChange={setBlockOpen} username={username} onConfirm={block} />
    </>
  );
}

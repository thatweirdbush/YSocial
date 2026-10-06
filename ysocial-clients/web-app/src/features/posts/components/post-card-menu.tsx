"use client";

import { Ban, Bookmark, Eye, EyeOff, Flag, Link2, MoreHorizontal, Pencil, Pin, PinOff, Trash2, VolumeX } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "@/hooks/use-translation";
import type { OwnerActions } from "../hooks/use-owner-actions";
import type { PostItem } from "../types";

interface PostCardMenuProps {
  post: PostItem;
  /** Owner's actions runner (from `PostCard`); its presence shows owner items. Presentation only: the mock service enforces ownership. */
  owner?: OwnerActions;
  isSavedPage?: boolean;
  onUnsave?: (id: string) => void;
  onEdit: () => void;
}

const ITEM = "rounded-xl px-3 py-2 cursor-pointer focus:bg-zinc-100 dark:focus:bg-zinc-900 text-sm";
const ICON = "size-4 text-zinc-400 mr-2";

/** Triple-dot menu: owner actions (edit, pin, hide likes, delete) or viewer actions. */
export function PostCardMenu({ post, owner, isSavedPage = false, onUnsave, onEdit }: PostCardMenuProps) {
  const { t } = useTranslation();
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Edit opens only after the menu closed: its focus scope would otherwise swallow the editor's autofocus
  const editRequestedRef = useRef(false);
  const busy = owner?.pendingOp !== undefined;
  const username = post.user.username;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/posts/${post.id}`);
      toast.success(t("card.copySuccess"));
    } catch {
      toast.error(t("common.error"));
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {/* `after:` = invisible 44px hit area around the 32px visual */}
          <Button variant="ghost" size="icon" aria-label={t("card.more")} className="relative size-8 after:absolute after:-inset-1.5 after:content-[''] rounded-full text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 active:scale-95 shrink-0">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="end"
          onCloseAutoFocus={(event) => {
            if (!editRequestedRef.current) return;
            editRequestedRef.current = false;
            event.preventDefault();
            onEdit();
          }}
          className="w-56 rounded-2xl border-zinc-200/50 dark:border-zinc-900 bg-white dark:bg-zinc-950 p-2 shadow-xl z-30">
          {isSavedPage ? (
            <DropdownMenuItem
              onSelect={() => (onUnsave ? onUnsave(post.id) : toast.success(t("card.unbookmarkSuccess")))}
              className={`${ITEM} text-red-600 focus:text-red-650`}
            >
              <Bookmark className="size-4 text-red-500 mr-2 fill-red-500/10" />
              {t("saved.unsave")}
            </DropdownMenuItem>
          ) : !owner && (
            <DropdownMenuItem onSelect={() => toast.success(t("card.bookmarkSuccess"))} className={ITEM}>
              <Bookmark className={ICON} />
              {t("card.bookmark")}
            </DropdownMenuItem>
          )}

          {owner ? (
            <>
              <DropdownMenuItem
                disabled={busy}
                onSelect={() => {
                  editRequestedRef.current = true;
                }}
                className={ITEM}
              >
                <Pencil className={ICON} />
                {t("card.edit")}
              </DropdownMenuItem>
              {post.parentId === undefined && (
                <DropdownMenuItem disabled={busy} onSelect={() => void owner.togglePin()} className={ITEM}>
                  {post.isPinned ? <PinOff className={ICON} /> : <Pin className={ICON} />}
                  {t(post.isPinned ? "card.unpin" : "card.pin")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem disabled={busy} onSelect={() => void owner.toggleHideLikeCount()} className={ITEM}>
                {post.hideLikeCount ? <Eye className={ICON} /> : <EyeOff className={ICON} />}
                {t(post.hideLikeCount ? "card.showLikes" : "card.hideLikes")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void copyLink()} className={ITEM}>
                <Link2 className={ICON} />
                {t("card.copyLink")}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-zinc-100 dark:bg-zinc-900" />
              <DropdownMenuItem
                disabled={busy}
                onSelect={() => setConfirmOpen(true)}
                className={`${ITEM} focus:bg-red-50 dark:focus:bg-red-950/20 text-red-600 dark:text-red-400 font-semibold`}
              >
                <Trash2 className="size-4 mr-2" />
                {t("card.delete")}
              </DropdownMenuItem>
            </>
          ) : (
            <>
              <DropdownMenuItem onSelect={() => toast.info(t("card.notInterestedToast"))} className={ITEM}>
                <EyeOff className={ICON} />
                {t("card.notInterested")}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-zinc-100 dark:bg-zinc-900" />
              <DropdownMenuItem onSelect={() => toast.info(t("card.muteToast", { username }))} className={ITEM}>
                <VolumeX className={ICON} />
                {t("card.mute", { username })}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => toast.info(t("card.blockToast", { username }))} className={ITEM}>
                <Ban className={ICON} />
                {t("card.block", { username })}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-zinc-100 dark:bg-zinc-900" />
              <DropdownMenuItem onSelect={() => void copyLink()} className={ITEM}>
                <Link2 className={ICON} />
                {t("card.copyLink")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => toast.success(t("card.reportToast"))}
                className={`${ITEM} focus:bg-red-50 dark:focus:bg-red-950/20 text-red-600 dark:text-red-400 font-semibold`}
              >
                <Flag className="size-4 mr-2" />
                {t("card.report")}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {owner && (
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent onClick={(event) => event.stopPropagation()}>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("card.deleteTitle")}</AlertDialogTitle>
              <AlertDialogDescription>{t("card.deleteDescription")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="min-h-11 rounded-full">{t("card.editCancel")}</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={() => void owner.remove()} className="min-h-11 rounded-full">
                {t("card.delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}

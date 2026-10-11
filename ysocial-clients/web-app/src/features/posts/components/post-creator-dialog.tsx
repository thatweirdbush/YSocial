"use client";

import React, { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PostCreatorCore, PostCreatorCoreRef } from "./post-creator-core";
import type { PostAudience, PostVisibility } from "../types";
import { useTranslation } from "@/hooks/use-translation";
import { useCurrentAuthor } from "../hooks/use-current-author";
import { createPost } from "../services/post-service";
import { usePostActions } from "../store/post-store";

interface PostCreatorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPostSubmitted?: (content: string, images: string[], audience: PostAudience, visibility: PostVisibility) => Promise<void>;
}

export function PostCreatorDialog({
  open,
  onOpenChange,
  onPostSubmitted,
}: PostCreatorDialogProps) {
  const { t } = useTranslation();
  const coreRef = useRef<PostCreatorCoreRef>(null);
  const author = useCurrentAuthor();
  const { prependPost } = usePostActions();

  // Default when the caller supplies no handler (sidebar "Create post"): publish to the mock feed.
  const submitPost = onPostSubmitted ?? (async (content: string, images: string[], audience: PostAudience, visibility: PostVisibility) => {
    const post = await createPost({ content, images, audience, ...(visibility === "closeFriends" ? { visibility } : {}) }, author);
    prependPost("forYou", post);
  });

  // Track states to prevent Keyboard/interaction trap
  const [isSubPopoverOpen, setIsSubPopoverOpen] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const handleCloseAttempt = (e: any) => {
    // Escape Shield: If any popover/dropdown is open inside, let it close and do nothing
    if (isSubPopoverOpen) {
      e.preventDefault();
      return;
    }

    // Shield: If there are unsaved changes, block close and show custom prompt
    if (hasUnsavedChanges) {
      e.preventDefault();
      coreRef.current?.triggerClose();
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      if (isSubPopoverOpen) return;
      if (hasUnsavedChanges) {
        coreRef.current?.triggerClose();
        return;
      }
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        onEscapeKeyDown={handleCloseAttempt}
        onPointerDownOutside={handleCloseAttempt}
        showCloseButton={false}
        className="max-w-xl w-[95vw] rounded-3xl p-6 border-zinc-200/50 dark:border-zinc-900 bg-white dark:bg-zinc-950 shadow-2xl z-50 overflow-hidden outline-none flex flex-col gap-4"
      >
        <DialogHeader className="flex flex-row items-center justify-between border-b border-zinc-100 dark:border-zinc-900/60 pb-3 mb-1 shrink-0">
          <button
            type="button"
            onClick={() => {
              if (hasUnsavedChanges) {
                coreRef.current?.triggerClose();
              } else {
                onOpenChange(false);
              }
            }}
            className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors cursor-pointer"
          >
            {t("creator.cancel") || "Cancel"}
          </button>

          <DialogTitle className="text-sm font-extrabold text-zinc-900 dark:text-zinc-50 tracking-tight select-none">
            {t("creator.newPost") || "New post"}
          </DialogTitle>

          <div className="w-12" /> {/* Symmetrical balancing placeholder */}
        </DialogHeader>

        <div className="grow min-h-0 overflow-y-auto">
          <PostCreatorCore
            ref={coreRef}
            isDialogMode={true}
            onCancel={() => onOpenChange(false)}
            onPopoverStateChange={setIsSubPopoverOpen}
            onStateChange={setHasUnsavedChanges}
            onPostSubmitted={async (content, images, audience, visibility) => {
              await submitPost(content, images, audience, visibility);
              onOpenChange(false);
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default PostCreatorDialog;

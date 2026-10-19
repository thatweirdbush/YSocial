"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useIsAuthenticated } from "@/features/auth/store/auth-store";
import { useTranslation } from "@/hooks/use-translation";
import { useCurrentAuthor } from "../../hooks/use-current-author";
import { createReply } from "../../services/post-service";
import { usePostActions } from "../../store/post-store";
import type { PostAudience, PostItem, PostRef } from "../../types";
import { PostCreatorCore } from "../post-creator-core";

interface ReplyComposerProps {
  /** Target of the reply (root post or comment): carries the root post id for the BE comment route. */
  parent: PostRef;
  replyToUsername: string;
}

/** Inline reply box: compact bar that expands into the full composer (reply mode). */
export function ReplyComposer({ parent, replyToUsername }: ReplyComposerProps) {
  const parentId = parent.id;
  const { t } = useTranslation();
  const router = useRouter();
  const isAuthenticated = useIsAuthenticated();
  const author = useCurrentAuthor();
  const { addReply, removeReply } = usePostActions();
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasContent, setHasContent] = useState(false);
  const barRef = useRef<HTMLButtonElement | null>(null);
  const restoreFocusRef = useRef(false);

  const placeholder = t("postDetail.replyPlaceholder", { username: replyToUsername });

  const collapse = useCallback(() => {
    restoreFocusRef.current = true;
    setHasContent(false);
    setIsExpanded(false);
  }, []);

  // Return keyboard focus to the collapsed bar after the composer unmounts.
  useEffect(() => {
    if (!isExpanded && restoreFocusRef.current) {
      restoreFocusRef.current = false;
      barRef.current?.focus();
    }
  }, [isExpanded]);

  // Escape collapses an empty composer; with text it stays open so nothing typed is lost.
  // Popovers inside PostCreatorCore stop propagation of their own Escape first.
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape" && !hasContent) collapse();
  };

  // Optimistic: show a temp reply immediately, swap in the created one, roll back on failure.
  // Rethrowing keeps PostCreatorCore from resetting, so the typed text survives for a retry.
  const handleSubmit = async (content: string, images: string[], audience: PostAudience) => {
    const tempReply: PostItem = {
      id: `reply-temp-${Date.now()}`,
      kind: "comment",
      rootPostId: parent.rootPostId,
      parentId,
      content,
      imageUrls: images.length > 0 ? images : undefined,
      createdAt: new Date().toISOString(),
      likesCount: 0,
      commentsCount: 0,
      isLikedByCurrentUser: false,
      isBookmarkedByCurrentUser: false,
      user: author,
      isPending: true,
    };
    addReply(parentId, tempReply);

    try {
      const created = await createReply(parent, { content, images, audience }, author);
      removeReply(parentId, tempReply.id);
      addReply(parentId, created);
      toast.success(t("postDetail.replySuccess"));
      collapse();
    } catch (error) {
      removeReply(parentId, tempReply.id);
      toast.error(t("postDetail.replyError"));
      throw error;
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="px-4 py-3 border-b border-zinc-200/60 dark:border-zinc-900/60">
        <button
          type="button"
          onClick={() => router.push("/login")}
          className="w-full min-h-11 rounded-full border border-zinc-200 dark:border-zinc-800 text-sm font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
        >
          {t("postDetail.loginToReply")}
        </button>
      </div>
    );
  }

  if (!isExpanded) {
    return (
      <div className="px-4 py-3 border-b border-zinc-200/60 dark:border-zinc-900/60">
        <button
          ref={barRef}
          type="button"
          onClick={() => setIsExpanded(true)}
          className="w-full min-h-11 flex items-center gap-3 text-left text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors cursor-text"
        >
          <span aria-hidden="true">
            <Avatar className="h-8 w-8">
              <AvatarImage src={author.avatarUrl} alt="" />
              <AvatarFallback className="bg-zinc-200 dark:bg-zinc-800 text-xs font-semibold">
                {author.displayName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </span>
          <span>{placeholder}</span>
        </button>
      </div>
    );
  }

  return (
    <div
      onKeyDown={handleKeyDown}
      className="p-4 border-b border-zinc-200/60 dark:border-zinc-900/60 animate-in fade-in duration-200 motion-reduce:animate-none"
    >
      <PostCreatorCore
        mode="reply"
        placeholder={placeholder}
        onPostSubmitted={handleSubmit}
        onStateChange={setHasContent}
      />
    </div>
  );
}

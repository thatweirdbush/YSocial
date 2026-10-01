"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useIsAuthenticated } from "@/features/auth/store/auth-store";
import { useTranslation } from "@/hooks/use-translation";
import { useCurrentAuthor } from "../../hooks/use-current-author";
import { createReply } from "../../services/post-service";
import { usePostActions } from "../../store/post-store";
import type { PostAudience, PostItem } from "../../types";
import { PostCreatorCore } from "../post-creator-core";

interface ReplyComposerProps {
  parentId: string;
  replyToUsername: string;
}

/** Inline reply box: compact bar that expands into the full composer (reply mode). */
export function ReplyComposer({ parentId, replyToUsername }: ReplyComposerProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const isAuthenticated = useIsAuthenticated();
  const author = useCurrentAuthor();
  const { addReply, removeReply } = usePostActions();
  const [isExpanded, setIsExpanded] = useState(false);

  const placeholder = t("postDetail.replyPlaceholder", { username: replyToUsername });

  // Optimistic: show a temp reply immediately, swap in the created one, roll back on failure.
  // Rethrowing keeps PostCreatorCore from resetting, so the typed text survives for a retry.
  const handleSubmit = async (content: string, images: string[], audience: PostAudience) => {
    const tempReply: PostItem = {
      id: `reply-temp-${Date.now()}`,
      parentId,
      content,
      imageUrls: images.length > 0 ? images : undefined,
      createdAt: new Date().toISOString(),
      likesCount: 0,
      commentsCount: 0,
      isLikedByCurrentUser: false,
      isBookmarkedByCurrentUser: false,
      user: author,
    };
    addReply(parentId, tempReply);

    try {
      const created = await createReply(parentId, { content, images, audience }, author);
      removeReply(parentId, tempReply.id);
      addReply(parentId, created);
      toast.success(t("postDetail.replySuccess"));
      setIsExpanded(false);
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
    <div className="p-4 border-b border-zinc-200/60 dark:border-zinc-900/60 animate-in fade-in duration-200 motion-reduce:animate-none">
      <PostCreatorCore
        mode="reply"
        placeholder={placeholder}
        onPostSubmitted={handleSubmit}
        onCancel={() => setIsExpanded(false)}
      />
    </div>
  );
}

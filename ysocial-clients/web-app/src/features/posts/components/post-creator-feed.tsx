"use client";

import React, { useRef, useEffect } from "react";
import { PostCreatorCore, PostCreatorCoreRef } from "./post-creator-core";
import { PostAudience } from "../types/creator";
import { toast } from "sonner";
import { useTranslation } from "@/hooks/use-translation";

interface PostCreatorFeedProps {
  onSuccess?: (content: string, imageUrl?: string) => Promise<void>;
}

export function PostCreatorFeed({ onSuccess }: PostCreatorFeedProps) {
  const { t } = useTranslation();
  const coreRef = useRef<PostCreatorCoreRef>(null);

  const handlePostSubmitted = async (
    content: string,
    images: string[],
    audience: PostAudience
  ) => {
    if (onSuccess) {
      // For compatibility with the existing backend mock, pass the first image URL if present
      await onSuccess(content, images[0] || undefined);
    }
  };

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const wasSaved = coreRef.current?.handleInlineEscape();
        if (wasSaved) {
          toast.success(t("creator.draftSaved") || "Draft saved successfully!");
        }
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, [t]);

  return (
    <div className="w-full border-b border-zinc-200/60 dark:border-zinc-900/60 p-4 bg-white dark:bg-black/40 transition-all">
      <PostCreatorCore ref={coreRef} onPostSubmitted={handlePostSubmitted} />
    </div>
  );
}

export default PostCreatorFeed;

"use client";

import React, { useRef, useEffect } from "react";
import { PostCreatorCore, PostCreatorCoreRef } from "./post-creator-core";
import type { CreatePostInput, PostAudience, PostVisibility } from "../types";

interface PostCreatorFeedProps {
  onSuccess?: (input: CreatePostInput) => Promise<void>;
}

export function PostCreatorFeed({ onSuccess }: PostCreatorFeedProps) {
  const coreRef = useRef<PostCreatorCoreRef>(null);

  const handlePostSubmitted = async (
    content: string,
    images: string[],
    audience: PostAudience,
    visibility: PostVisibility
  ) => {
    await onSuccess?.({ content, images, audience, ...(visibility === "closeFriends" ? { visibility } : {}) });
  };

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        coreRef.current?.handleInlineEscape();
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, []);

  return (
    <div className="w-full border-b border-zinc-200/60 dark:border-zinc-900/60 p-4 bg-white dark:bg-black/40 transition-all">
      <PostCreatorCore ref={coreRef} onPostSubmitted={handlePostSubmitted} />
    </div>
  );
}

export default PostCreatorFeed;

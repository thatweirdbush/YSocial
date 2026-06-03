"use client";

import React from "react";
import { PostCreatorCore } from "./post-creator-core";
import { PostAudience } from "../types/creator";

interface PostCreatorFeedProps {
  onSuccess?: (content: string, imageUrl?: string) => Promise<void>;
}

export function PostCreatorFeed({ onSuccess }: PostCreatorFeedProps) {
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

  return (
    <div className="w-full border-b border-zinc-200/60 dark:border-zinc-900/60 p-4 bg-white dark:bg-black/40 transition-all">
      <PostCreatorCore onPostSubmitted={handlePostSubmitted} />
    </div>
  );
}

export default PostCreatorFeed;

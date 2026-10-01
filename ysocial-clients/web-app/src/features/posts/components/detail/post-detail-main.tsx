"use client";

import { usePost } from "../../store/post-store";
import { PostCard } from "../post-card";

interface PostDetailMainProps {
  postId: string;
  /** Parent author's username when this post is itself a reply. */
  replyToUsername?: string;
}

export function PostDetailMain({ postId, replyToUsername }: PostDetailMainProps) {
  const post = usePost(postId);
  return post ? <PostCard post={post} variant="detail" replyToUsername={replyToUsername} /> : null;
}

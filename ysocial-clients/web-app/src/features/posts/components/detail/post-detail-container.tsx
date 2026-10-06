"use client";

import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/shared/empty-state";
import { useTranslation } from "@/hooks/use-translation";
import { fetchPostThread } from "../../services/post-service";
import { usePostActions } from "../../store/post-store";
import { PostDetailMain } from "./post-detail-main";
import { PostDetailShell } from "./post-detail-shell";
import { PostDetailSkeleton } from "./post-detail-skeleton";
import { ReplyComposer } from "./reply-composer";
import { ReplyList } from "./reply-list";

type LoadState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "error" }
  | { status: "ready"; authorUsername: string; parentUsername?: string };

/** Thread page body. Mount with `key={postId}` so navigating between threads starts fresh. */
export function PostDetailContainer({ postId }: { postId: string }) {
  const { t } = useTranslation();
  const { upsertPosts, setReplies } = usePostActions();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    fetchPostThread(postId)
      .then((thread) => {
        if (cancelled) return;
        if (!thread) {
          setState({ status: "missing" });
          return;
        }

        const childLists = Object.entries(thread.childReplies);
        upsertPosts([
          thread.post,
          ...(thread.parent ? [thread.parent] : []),
          ...thread.replies,
          ...childLists.flatMap(([, children]) => children),
        ]);
        setReplies(postId, thread.replies.map((r) => r.id));
        for (const [replyId, children] of childLists) {
          setReplies(replyId, children.map((c) => c.id));
        }

        setState({
          status: "ready",
          authorUsername: thread.post.user.username,
          parentUsername: thread.parent?.user.username,
        });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, [postId, attempt, upsertPosts, setReplies]);

  if (state.status === "missing") notFound();

  const handleRetry = () => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  };

  return (
    <PostDetailShell>
      {state.status === "loading" ? (
        <PostDetailSkeleton />
      ) : state.status === "error" ? (
        <EmptyState
          icon={AlertCircle}
          title={t("postDetail.errorTitle")}
          action={
            <button
              type="button"
              onClick={handleRetry}
              className="min-h-11 px-5 rounded-full border border-zinc-200 dark:border-zinc-800 text-sm font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
            >
              {t("postDetail.retry")}
            </button>
          }
        />
      ) : state.status === "ready" ? (
        <>
          <PostDetailMain postId={postId} replyToUsername={state.parentUsername} />
          <ReplyComposer parentId={postId} replyToUsername={state.authorUsername} />
          <ReplyList parentId={postId} />
        </>
      ) : null}
    </PostDetailShell>
  );
}

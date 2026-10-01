"use client";

import Link from "next/link";
import { useTranslation } from "@/hooks/use-translation";
import { usePost, useReplyIds } from "../../store/post-store";
import { PostCard } from "../post-card";

/** Child replies rendered inline under a reply; the rest live on the reply's own thread page. */
export const MAX_INLINE_CHILD_REPLIES = 2;

function ChildReply({ id }: { id: string }) {
  const post = usePost(id);
  return post ? <PostCard post={post} variant="compact" /> : null;
}

export function ReplyItem({ replyId }: { replyId: string }) {
  const { t } = useTranslation();
  const reply = usePost(replyId);
  const childIds = useReplyIds(replyId);

  if (!reply) return null;

  const visibleChildIds = childIds.slice(0, MAX_INLINE_CHILD_REPLIES);
  const hiddenCount = childIds.length - visibleChildIds.length;

  return (
    <div className="flex flex-col">
      <PostCard post={reply} variant="compact" />
      {visibleChildIds.length > 0 && (
        // Indented one level only; deeper replies are reached via the reply's own thread.
        <div className="pl-12 flex flex-col">
          {visibleChildIds.map((id) => (
            <ChildReply key={id} id={id} />
          ))}
          {hiddenCount > 0 && (
            <Link
              href={`/posts/${replyId}`}
              className="min-h-11 flex items-center px-4 text-sm font-semibold text-zinc-500 dark:text-zinc-400 hover:text-black dark:hover:text-white transition-colors w-fit"
            >
              {t("postDetail.viewMoreReplies", { n: hiddenCount })}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

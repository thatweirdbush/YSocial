"use client";

import { AlertCircle, Bookmark, Image as ImageIcon, MessageSquare, Reply } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { PostCard, PostSkeletonList, useIsDeleted, usePinnedPostId, usePost } from "@/features/posts";
import type { ParentReference } from "@/features/posts/types";
import { useTranslation } from "@/hooks/use-translation";
import { useProfileTabPosts } from "../hooks/use-profile-tab-posts";
import type { ProfileTab } from "../types";
import { orderWithPin } from "../utils/order-with-pin";
import { ProfileLockedState } from "./profile-locked-state";
import { ProfileMediaGrid } from "./profile-media-grid";
import { ReplyContext } from "./reply-context";

interface ProfileTabPanelProps {
  tab: ProfileTab;
  userId: string;
  username: string;
  isOwn: boolean;
  /** Own empty Threads CTA; the container maps it to the global composer (no post UI imported here). */
  onCreatePost: () => void;
}

export function ProfileTabPanel({ tab, userId, username, isOwn, onCreatePost }: ProfileTabPanelProps) {
  const { t } = useTranslation();
  const { ids, parents, status, locked, hasMore, loadMore, retry } = useProfileTabPosts(tab);
  const pinnedId = usePinnedPostId(userId);
  const orderedIds = useMemo(() => (tab === "threads" ? orderWithPin(ids, pinnedId) : ids), [ids, pinnedId, tab]);

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const target = sentinelRef.current;
    if (!target || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: "600px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loadMore, orderedIds.length]);

  const retryButton = (
    <Button type="button" variant="outline" onClick={retry} className="min-h-11 rounded-full px-5">
      {t("profile.retry")}
    </Button>
  );

  let body: React.ReactNode;
  if (locked) {
    body = <ProfileLockedState variant="private" username={username} />;
  } else if (orderedIds.length === 0 && (status === "idle" || status === "loading")) {
    body = <PostSkeletonList count={3} />;
  } else if (orderedIds.length === 0 && status === "error") {
    body = <EmptyState icon={AlertCircle} title={t("profile.tabError")} action={retryButton} />;
  } else if (orderedIds.length === 0) {
    body = <EmptyPanel tab={tab} username={username} isOwn={isOwn} onCreatePost={onCreatePost} />;
  } else if (tab === "media") {
    body = <ProfileMediaGrid ids={orderedIds} username={username} />;
  } else {
    body = (
      <div className="flex flex-col">
        {orderedIds.map((id) => (
          <TabPost key={id} id={id} parents={tab === "replies" ? parents : undefined} />
        ))}
      </div>
    );
  }

  return (
    <div role="tabpanel" id={`profile-panel-${tab}`} aria-labelledby={`profile-tab-${tab}`} tabIndex={0} className="outline-none">
      {body}
      {orderedIds.length > 0 && status === "error" && (
        <div className="flex items-center justify-center gap-3 px-4 py-6 text-sm text-zinc-500">
          <span>{t("profile.tabError")}</span>
          {retryButton}
        </div>
      )}
      {hasMore && <div ref={sentinelRef} aria-hidden="true" className="h-px" />}
      {hasMore && orderedIds.length > 0 && <PostSkeletonList count={1} />}
    </div>
  );
}

/** One post of a list tab; resolves the cached post and hides tombstoned ones. `parents` set -> Replies tab. */
function TabPost({ id, parents }: { id: string; parents?: Record<string, ParentReference> }) {
  const post = usePost(id);
  const isDeleted = useIsDeleted(id);
  if (!post || isDeleted) return null;
  const parent = parents && post.parentId ? parents[post.parentId] : undefined;
  return (
    <>
      {parent && <ReplyContext parent={parent} />}
      <PostCard post={post} />
    </>
  );
}

function EmptyPanel({ tab, username, isOwn, onCreatePost }: Pick<ProfileTabPanelProps, "tab" | "username" | "isOwn" | "onCreatePost">) {
  const { t } = useTranslation();

  switch (tab) {
    case "threads":
      return isOwn ? (
        <EmptyState
          icon={MessageSquare}
          title={t("profile.emptyThreadsOwn")}
          action={
            <Button type="button" onClick={onCreatePost} className="min-h-11 rounded-full px-5">
              {t("profile.emptyThreadsOwnCta")}
            </Button>
          }
        />
      ) : (
        <EmptyState icon={MessageSquare} title={t("profile.emptyThreads", { username })} />
      );
    case "replies":
      return <EmptyState icon={Reply} title={t("profile.emptyReplies")} />;
    case "media":
      return <EmptyState icon={ImageIcon} title={t("profile.emptyMedia")} />;
    case "saved":
      return <EmptyState icon={Bookmark} title={t("profile.emptySaved")} description={t("profile.emptySavedHint")} />;
  }
}

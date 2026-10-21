"use client";

import React, { useEffect, useState } from "react";
import {
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  Check,
  Sparkles,
  ShieldCheck,
  EyeOff,
  Pin,
  Star,
} from "lucide-react";
import { UserAvatar } from "@/components/shared/user-avatar";
import { ensureUser, FollowButton, useUser, UserHoverCard } from "@/features/profile";
import { useDisplayPrefs } from "@/features/settings/store/settings-store";
import { useTranslation } from "@/hooks/use-translation";
import { toast } from "sonner";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setPostBookmark, setPostLike } from "../services/post-service";
import { useCurrentAuthor } from "../hooks/use-current-author";
import { useOwnerActions, type OwnerActions } from "../hooks/use-owner-actions";
import { useIsAuthorBlocked, useIsDeleted, usePost, usePostActions, usePostAuthorId } from "../store/post-store";
import type { PostItem } from "../types";
import { getVisibleLikeCount } from "../utils/like-visibility";
import { toPostRef } from "../utils/post-ref";
import { hasCapability } from "@/lib/capabilities";
import { RichContent } from "../utils/rich-content";
import { PostCardMenu } from "./post-card-menu";
import { PostInlineEditor } from "./post-inline-editor";
import { mediaItemsOf } from "../utils/post-media";
import { PostLightbox } from "./post-lightbox";
import { PostMediaGrid } from "./post-media-grid";

export type PostCardVariant = "feed" | "detail" | "compact";

interface PostCardProps {
  post: PostItem;
  /** feed: default list card; detail: thread root (larger text, stats, no navigation); compact: reply row. */
  variant?: PostCardVariant;
  /** Shown above content in the detail variant when the post is a reply. */
  replyToUsername?: string;
  isSavedPage?: boolean;
  onUnsave?: (id: string) => void;
  /** Normalized search tokens highlighted in the content. */
  highlightTokens?: readonly string[];
}

export function PostCard(props: PostCardProps) {
  const authorId = usePostAuthorId(props.post.id) ?? props.post.user.id;
  const isOwner = authorId === useCurrentAuthor().id;
  const isBlocked = useIsAuthorBlocked(authorId);
  // Fallback for lists that are not refilled after a block (search, tags, saved, profile tabs): spec D26
  if (isBlocked) return null;
  return isOwner ? <OwnerPostCard {...props} /> : <PostCardView {...props} />;
}

/** Owner cards only: one owner-actions runner shared by the menu & the inline editor. */
function OwnerPostCard(props: PostCardProps) {
  const owner = useOwnerActions(props.post.id);
  return <PostCardView {...props} owner={owner} />;
}

function PostCardView({
  post,
  variant = "feed",
  replyToUsername,
  isSavedPage = false,
  onUnsave,
  highlightTokens,
  owner,
}: PostCardProps & { owner?: OwnerActions }) {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const { toggleLike, toggleBookmark } = usePostActions();

  // Shared store copy wins so every card of this post stays in sync; fall back to the prop until cached.
  const live = usePost(post.id) ?? post;
  // Author fields come from `user-store` so profile edits show everywhere; the post snapshot is the fallback
  const author = useUser(post.user.id) ?? post.user;
  const isDeleted = useIsDeleted(post.id);
  const viewerId = useCurrentAuthor().id;
  const isOwner = owner !== undefined;
  const [isEditing, setIsEditing] = useState(false);
  const isLiked = live.isLikedByCurrentUser;
  // null = owner hid the count from this viewer
  const { hideLikeCounts, hideShareCounts } = useDisplayPrefs();
  const likesCount = hideLikeCounts ? null : getVisibleLikeCount(live, viewerId);
  const likesHiddenForOthers = isOwner && live.hideLikeCount === true;
  const isBookmarked = live.isBookmarkedByCurrentUser;
  const bookmarksCount = isBookmarked ? 12 : 11;
  const isDetail = variant === "detail";
  // Close friends posts get a green ring + label (the viewer only sees them when marked, so this is never a leak)
  const isCloseFriends = hasCapability("closeFriendsBadge") && live.visibility === "closeFriends";

  const [sharesCount, setSharesCount] = useState(14);

  // Header Follow & hover card read the author from `user-store`; load it once per author (deduped, cached)
  const authorId = post.user.id;
  useEffect(() => {
    if (!isOwner) ensureUser(authorId, viewerId).catch(() => undefined);
  }, [authorId, viewerId, isOwner]);

  // Micro-UX Animation triggers
  const [likeAnimating, setLikeAnimating] = useState(false);
  const [showSparkles, setShowSparkles] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [bookmarkAnimating, setBookmarkAnimating] = useState(false);

  // Open lightbox image index (null = closed)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Safely capture single image fallback or multi-image lists
  const mediaItems = mediaItemsOf(post);

  // Parse relative time dynamically matching i18n
  const formatTime = (dateStr: string) => {
    const now = new Date();
    const created = new Date(dateStr);
    const diffMs = now.getTime() - created.getTime();
    const diffMins = Math.max(1, Math.floor(diffMs / 60000));

    if (diffMins < 60) {
      return t("card.minutesAgo", { n: diffMins });
    }

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) {
      return t("card.hoursAgo", { n: diffHours });
    }

    const diffDays = Math.floor(diffHours / 24);
    return t("card.daysAgo", { n: diffDays });
  };

  // Absolute timestamp for the detail variant, e.g. "14:32 · 1 thg 10, 2026"
  const formatFullTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const intlLocale = locale === "vi" ? "vi-VN" : "en-US";
    const time = new Intl.DateTimeFormat(intlLocale, { hour: "2-digit", minute: "2-digit" }).format(date);
    const day = new Intl.DateTimeFormat(intlLocale, { day: "numeric", month: "short", year: "numeric" }).format(date);
    return `${time} · ${day}`;
  };

  const openThread = () => {
    // A click that ends a drag/double-click selection means the user is copying text, not opening the thread.
    if (isDetail || window.getSelection()?.isCollapsed === false) return;
    router.push(`/posts/${post.id}`);
  };

  const handleLike = () => {
    const nextState = !isLiked;
    toggleLike(post.id, post);
    // Server refused (blocked/deleted mid-session, expired token, offline): undo the optimistic flip
    setPostLike(toPostRef(post), nextState).catch(() => {
      toggleLike(post.id, post);
      toast.error(t("common.error"));
    });

    if (nextState) {
      setLikeAnimating(true);
      setShowSparkles(true);
      toast.success(t("card.likeSuccess"), { duration: 1500 });
      // Stop sparkles after 600ms
      setTimeout(() => setShowSparkles(false), 600);
    } else {
      toast.info(t("card.unlikeSuccess"), { duration: 1500 });
    }
  };

  const handleBookmark = () => {
    const nextState = !isBookmarked;
    toggleBookmark(post.id, post);
    setPostBookmark(toPostRef(post), nextState).catch(() => {
      toggleBookmark(post.id, post);
      toast.error(t("common.error"));
    });
    setBookmarkAnimating(true);

    if (nextState) {
      toast.success(t("card.bookmarkSuccess"), { duration: 1500 });
    } else {
      toast.info(t("card.unbookmarkSuccess"), { duration: 1500 });
    }
  };

  const handleShare = async () => {
    if (shareCopied) return;

    // Copy fake post absolute link to Clipboard
    const shareUrl = typeof window !== "undefined"
      ? `${window.location.origin}/posts/${post.id}`
      : `https://ysocial.app/posts/${post.id}`;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
      setSharesCount((prev) => prev + 1);
      toast.success(t("card.copySuccess"));

      // Revert checkmark icon rotation after 2 seconds
      setTimeout(() => {
        setShareCopied(false);
      }, 2000);
    } catch {
      toast.error(t("common.error"));
    }
  };

  const saveEdit = async (content: string) => {
    if (!owner) return false;
    const saved = await owner.edit(content);
    if (saved) setIsEditing(false);
    return saved;
  };

  // Tombstoned: lists holding their own copy (search, saved) must not show a deleted post
  if (isDeleted) return null;

  return (
    <article
      inert={live.isPending}
      aria-busy={live.isPending || undefined}
      className={`w-full border-b border-zinc-200/60 dark:border-zinc-900/60 p-4 bg-white dark:bg-black/40 flex gap-3 items-start relative transition-[colors,opacity] duration-300 motion-reduce:transition-none hover:bg-zinc-100/10 dark:hover:bg-zinc-900/10 group ${live.isPending ? "opacity-60" : ""}`}
    >

      {/* Left Column: Avatar & vertical Thread Line */}
      <div className="flex flex-col items-center self-stretch shrink-0">
        <UserHoverCard userId={post.user.id}>
          <Link href={`/@${post.user.username}`}>
            <UserAvatar
              src={author.avatarUrl}
              name={author.displayName ?? ""}
              alt={author.displayName}
              className={`${variant === "compact" ? "size-8" : "size-10"} border border-zinc-150 dark:border-zinc-850 shrink-0 hover:opacity-85 transition-opacity ${isCloseFriends ? "ring-2 ring-emerald-500 ring-offset-2 ring-offset-white dark:ring-offset-black" : ""}`}
            />
          </Link>
        </UserHoverCard>
        {/* Thread connector line running through */}
        <div className="w-[1.5px] grow bg-zinc-200 dark:bg-zinc-900 my-2 rounded-full opacity-60 group-hover:opacity-100 transition-opacity" />
      </div>

      {/* Right Column: User details, content, actions */}
      <div className="flex-1 flex flex-col gap-2 min-w-0">

        {live.isPinned && !live.parentId && variant !== "compact" && (
          <div className="flex items-center gap-1 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
            <Pin className="size-3.5" aria-hidden="true" />
            {t("card.pinned")}
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
            <UserHoverCard userId={post.user.id}>
              <Link href={`/@${post.user.username}`} className="flex items-center gap-1.5 min-w-0">
                <span className="font-bold text-sm text-black dark:text-zinc-100 truncate hover:underline cursor-pointer">
                  {author.displayName}
                </span>
                {author.isVerified && (
                  <ShieldCheck className="size-4 text-blue-500 shrink-0 fill-blue-500/10" />
                )}
                <span className="text-zinc-400 dark:text-zinc-500 text-xs truncate">
                  @{author.username}
                </span>
              </Link>
            </UserHoverCard>

            {isCloseFriends && (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                <Star className="size-3" aria-hidden="true" />
                {t("card.closeFriends")}
              </span>
            )}

            {/* Follow bound to user-store: same state as the hover card, sidebar & search */}
            {!isOwner && <FollowButton userId={post.user.id} className="ml-1.5" reserveSpace />}

            <span className="text-zinc-300 dark:text-zinc-850 text-xs select-none">•</span>
            <span className="text-zinc-400 dark:text-zinc-500 text-xs">
              {isDetail ? formatFullTime(post.createdAt) : formatTime(post.createdAt)}
            </span>
            {live.isEdited && (
              <span className="text-zinc-400 dark:text-zinc-500 text-xs">· {t("card.edited")}</span>
            )}
          </div>

          {/* Triple-dot actions (owner vs viewer) */}
          {!live.isPending && (
            <PostCardMenu
              post={live}
              owner={owner}
              isSavedPage={isSavedPage}
              onUnsave={onUnsave}
              onEdit={() => setIsEditing(true)}
            />
          )}
        </div>

        {isDetail && replyToUsername && live.parentId && (
          <Link href={`/posts/${live.parentId}`} className="text-xs text-zinc-500 dark:text-zinc-400 hover:underline w-fit">
            {t("postDetail.replyingTo", { username: replyToUsername })}
          </Link>
        )}

        {/* Content body — opens the thread (only text, so lightbox portal clicks never bubble into navigation) */}
        {isEditing ? (
          <PostInlineEditor
            initialContent={live.content}
            hasImages={mediaItems.length > 0}
            disabled={owner?.pendingOp !== undefined}
            onSave={saveEdit}
            onCancel={() => setIsEditing(false)}
          />
        ) : (
          <div
            onClick={openThread}
            className={`${isDetail ? "text-[17px]" : "text-sm cursor-pointer"} text-zinc-900 dark:text-zinc-200 leading-relaxed break-words pr-2`}
          >
            <RichContent content={live.content} highlightTokens={highlightTokens} />
          </div>
        )}

        {/* Dynamic Multi-image Grid rendering */}
        <PostMediaGrid items={mediaItems} onOpen={setLightboxIndex} />

        {isDetail && (
          <div className="flex items-center gap-4 pt-3 mt-1 border-t border-zinc-200/60 dark:border-zinc-900/60 text-sm text-zinc-500 dark:text-zinc-400">
            {likesCount !== null && (
              <span><strong className="text-black dark:text-white">{likesCount}</strong> {t("postDetail.likes")}</span>
            )}
            <span><strong className="text-black dark:text-white">{live.commentsCount}</strong> {t("postDetail.replies")}</span>
          </div>
        )}

        {/* Actions Toolbar */}
        <div className="flex items-center gap-6 mt-3 text-zinc-400 dark:text-zinc-500 pl-1 select-none">

          {/* Like pop trigger */}
          <div className="flex items-center gap-1.5 relative">
            {showSparkles && (
              <Sparkles className="absolute -top-6 -left-2 size-8 text-amber-400 fill-amber-300 animate-sparkle-burst pointer-events-none" />
            )}
            <button
              type="button"
              aria-label={t("card.like")}
              aria-pressed={isLiked}
              onClick={handleLike}
              onAnimationEnd={() => setLikeAnimating(false)}
              className={`p-1.5 rounded-full transition-all duration-300 hover:bg-red-50 dark:hover:bg-red-950/20 active:scale-75 ${isLiked
                ? "text-red-500 dark:text-red-400 animate-heart-pop"
                : "hover:text-red-500 dark:hover:text-red-400"
                } ${likeAnimating ? "animate-heart-pop" : ""}`}
            >
              <Heart className={`size-4.5 ${isLiked ? "fill-current" : ""}`} />
            </button>
            {likesCount !== null && likesCount > 0 && (
              <span className={`text-xs font-semibold ${isLiked ? "text-red-500 dark:text-red-450" : ""}`}>
                {likesCount}
              </span>
            )}
            {likesHiddenForOthers && (
              <EyeOff className="size-3.5" role="img" aria-label={t("card.likesHiddenHint")}>
                <title>{t("card.likesHiddenHint")}</title>
              </EyeOff>
            )}
          </div>

          {/* Comment trigger */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label={t("card.comment")}
              onClick={openThread}
              className="p-1.5 rounded-full hover:bg-blue-50 dark:hover:bg-blue-950/20 hover:text-blue-500 dark:hover:text-blue-450 active:scale-75 transition-all"
            >
              <MessageCircle className="size-4.5" />
            </button>
            {live.commentsCount > 0 && (
              <span className="text-xs font-semibold">{live.commentsCount}</span>
            )}
          </div>

          {/* Bookmark trigger with counters */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label={t("card.bookmark")}
              aria-pressed={isBookmarked}
              onClick={handleBookmark}
              onAnimationEnd={() => setBookmarkAnimating(false)}
              className={`p-1.5 rounded-full hover:bg-amber-50 dark:hover:bg-amber-950/20 hover:text-amber-500 dark:hover:text-amber-450 active:scale-75 transition-all ${isBookmarked ? "text-amber-500 dark:text-amber-400" : ""
                } ${bookmarkAnimating ? "scale-105 duration-200" : ""}`}
            >
              <Bookmark className={`size-4.5 ${isBookmarked ? "fill-current" : ""}`} />
            </button>
            {bookmarksCount > 0 && (
              <span className={`text-xs font-semibold ${isBookmarked ? "text-amber-500 dark:text-amber-450" : ""}`}>
                {bookmarksCount}
              </span>
            )}
          </div>

          {/* Share with rotating checkmark transition and counters */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label={t("card.share")}
              onClick={handleShare}
              className={`p-1.5 rounded-full hover:bg-green-50 dark:hover:bg-green-950/20 hover:text-green-500 dark:hover:text-green-450 active:scale-75 transition-all duration-300 ${shareCopied ? "rotate-360 text-green-500 dark:text-green-400" : ""
                }`}
            >
              {shareCopied ? (
                <Check className="size-4.5 stroke-[3px] scale-105" />
              ) : (
                <Share2 className="size-4.5" />
              )}
            </button>
            {sharesCount > 0 && !hideShareCounts && (
              <span className={`text-xs font-semibold ${shareCopied ? "text-green-500 dark:text-green-450" : ""}`}>
                {sharesCount}
              </span>
            )}
          </div>

        </div>

      </div>

      <PostLightbox
        items={mediaItems}
        index={lightboxIndex}
        onIndexChange={setLightboxIndex}
        onClose={() => setLightboxIndex(null)}
      />

    </article>
  );
}
export default PostCard;

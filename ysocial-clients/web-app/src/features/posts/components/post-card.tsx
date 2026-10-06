"use client";

import React, { useState, useEffect } from "react";
import {
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  MoreHorizontal,
  Check,
  Sparkles,
  ShieldCheck,
  EyeOff,
  Flag,
  VolumeX,
  Ban,
  Link2,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/use-translation";
import { toast } from "sonner";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRouter } from "next/navigation";
import { setPostBookmark, setPostLike } from "../services/post-service";
import { usePost, usePostActions } from "../store/post-store";
import type { PostItem } from "../types";
import { RichContent } from "../utils/rich-content";
import { PostLightbox } from "./post-lightbox";
import { PostMediaGrid } from "./post-media-grid";

export type PostCardVariant = "feed" | "detail" | "compact";

interface PostCardProps {
  post: PostItem;
  /** feed: default list card; detail: thread root (larger text, stats, no navigation); compact: reply row. */
  variant?: PostCardVariant;
  /** Shown above content in the detail variant when the post is a reply. */
  replyToUsername?: string;
  isAuthorFollowing?: boolean;
  onAuthorFollowToggle?: () => void;
  isSavedPage?: boolean;
  onUnsave?: (id: string) => void;
  /** Normalized search tokens highlighted in the content. */
  highlightTokens?: readonly string[];
}

export function PostCard({
  post,
  variant = "feed",
  replyToUsername,
  isAuthorFollowing,
  onAuthorFollowToggle,
  isSavedPage = false,
  onUnsave,
  highlightTokens,
}: PostCardProps) {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const { toggleLike, toggleBookmark } = usePostActions();

  // Shared store copy wins so every card of this post stays in sync; fall back to the prop until cached.
  const live = usePost(post.id) ?? post;
  const isLiked = live.isLikedByCurrentUser;
  const likesCount = live.likesCount;
  const isBookmarked = live.isBookmarkedByCurrentUser;
  const bookmarksCount = isBookmarked ? 12 : 11;
  const isDetail = variant === "detail";

  const [sharesCount, setSharesCount] = useState(14);
  const [isFollowing, setIsFollowing] = useState(isAuthorFollowing ?? false);

  // Synchronize local follow state with parent prop using primitive equality check to prevent render loops
  useEffect(() => {
    if (isAuthorFollowing !== undefined && isAuthorFollowing !== isFollowing) {
      setIsFollowing(isAuthorFollowing);
    }
  }, [isAuthorFollowing, isFollowing]);

  // Micro-UX Animation triggers
  const [likeAnimating, setLikeAnimating] = useState(false);
  const [showSparkles, setShowSparkles] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [bookmarkAnimating, setBookmarkAnimating] = useState(false);

  // Open lightbox image index (null = closed)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Safely capture single image fallback or multi-image lists
  const images = post.imageUrls || (post.imageUrl ? [post.imageUrl] : []);

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
    void setPostLike(post.id, nextState);

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
    void setPostBookmark(post.id, nextState);
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

  const handleFollowToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextState = !isFollowing;
    setIsFollowing(nextState);
    if (onAuthorFollowToggle) {
      onAuthorFollowToggle();
    } else {
      if (nextState) {
        toast.success(`Following @${post.user.username}`);
      } else {
        toast.info(`Unfollowed @${post.user.username}`);
      }
    }
  };

  return (
    <article
      inert={live.isPending}
      aria-busy={live.isPending || undefined}
      className={`w-full border-b border-zinc-200/60 dark:border-zinc-900/60 p-4 bg-white dark:bg-black/40 flex gap-3 items-start relative transition-[colors,opacity] duration-300 motion-reduce:transition-none hover:bg-zinc-100/10 dark:hover:bg-zinc-900/10 group ${live.isPending ? "opacity-60" : ""}`}
    >

      {/* Left Column: Avatar & vertical Thread Line */}
      <div className="flex flex-col items-center self-stretch shrink-0">
        <Link href={`/@${post.user.username}`}>
          <Avatar className={`${variant === "compact" ? "size-8" : "size-10"} border border-zinc-150 dark:border-zinc-850 shrink-0 hover:opacity-85 transition-opacity`}>
            <AvatarImage src={post.user.avatarUrl} alt={post.user.displayName} />
            <AvatarFallback className="bg-zinc-200 dark:bg-zinc-800 text-xs font-semibold">
              {post.user.displayName?.charAt(0).toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
        </Link>
        {/* Thread connector line running through */}
        <div className="w-[1.5px] grow bg-zinc-200 dark:bg-zinc-900 my-2 rounded-full opacity-60 group-hover:opacity-100 transition-opacity" />
      </div>

      {/* Right Column: User details, content, actions */}
      <div className="flex-1 flex flex-col gap-2 min-w-0">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
            <Link href={`/@${post.user.username}`} className="flex items-center gap-1.5 min-w-0">
              <span className="font-bold text-sm text-black dark:text-zinc-100 truncate hover:underline cursor-pointer">
                {post.user.displayName}
              </span>
              {post.user.isVerified && (
                <ShieldCheck className="size-4 text-blue-500 shrink-0 fill-blue-500/10" />
              )}
              <span className="text-zinc-400 dark:text-zinc-500 text-xs truncate">
                @{post.user.username}
              </span>
            </Link>

            {/* Small premium Follow Button in Header */}
            <button
              onClick={handleFollowToggle}
              className={`ml-1.5 text-[11px] font-bold tracking-tight transition-all duration-300 px-3 py-0.5 rounded-full border ${isFollowing
                ? "bg-zinc-100 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-450"
                : "bg-transparent border-zinc-950 dark:border-zinc-100 text-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
                }`}
            >
              {isFollowing ? t("card.following") || "Following" : t("card.follow") || "Follow"}
            </button>

            <span className="text-zinc-300 dark:text-zinc-850 text-xs select-none">•</span>
            <span className="text-zinc-400 dark:text-zinc-500 text-xs">
              {isDetail ? formatFullTime(post.createdAt) : formatTime(post.createdAt)}
            </span>
          </div>

          {/* Triple-dot Dropdown actions */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t("card.more")} className="size-8 rounded-full text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 active:scale-95 shrink-0">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            
            <DropdownMenuContent align="end" className="w-52 rounded-2xl border-zinc-200/50 dark:border-zinc-900 bg-white dark:bg-zinc-950 p-2 shadow-xl z-30">
              {isSavedPage ? (
                <DropdownMenuItem
                  onClick={() => {
                    if (onUnsave) {
                      onUnsave(post.id);
                    } else {
                      toast.success(t("card.unbookmarkSuccess") || "Removed from saved posts!");
                    }
                  }}
                  className="rounded-xl px-3 py-2 cursor-pointer focus:bg-zinc-100 dark:focus:bg-zinc-900 text-sm text-red-600 focus:text-red-650"
                >
                  <Bookmark className="size-4 text-red-500 mr-2 fill-red-500/10" />
                  {t("saved.unsave" as any) || "Unsave"}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => toast.info(`Saved`)} className="rounded-xl px-3 py-2 cursor-pointer focus:bg-zinc-100 dark:focus:bg-zinc-900 text-sm">
                  <Bookmark className="size-4 text-zinc-400 mr-2" />
                  Save
                </DropdownMenuItem>
              )}

              <DropdownMenuItem onClick={() => toast.info(`Not interested`)} className="rounded-xl px-3 py-2 cursor-pointer focus:bg-zinc-100 dark:focus:bg-zinc-900 text-sm">
                <EyeOff className="size-4 text-zinc-400 mr-2" />
                Not interested
              </DropdownMenuItem>

              <DropdownMenuSeparator className="bg-zinc-100 dark:bg-zinc-900" />

              <DropdownMenuItem onClick={() => toast.info(`Muted @${post.user.username}`)} className="rounded-xl px-3 py-2 cursor-pointer focus:bg-zinc-100 dark:focus:bg-zinc-900 text-sm">
                <VolumeX className="size-4 text-zinc-400 mr-2" />
                Mute @{post.user.username}
              </DropdownMenuItem>

              <DropdownMenuItem onClick={() => toast.info(`Blocked @${post.user.username}`)} className="rounded-xl px-3 py-2 cursor-pointer focus:bg-zinc-100 dark:focus:bg-zinc-900 text-sm">
                <Ban className="size-4 text-zinc-400 mr-2" />
                Block @{post.user.username}
              </DropdownMenuItem>

              <DropdownMenuSeparator className="bg-zinc-100 dark:bg-zinc-900" />

              <DropdownMenuItem onClick={() => toast.success("Copied embed link to clipboard!")} className="rounded-xl px-3 py-2 cursor-pointer focus:bg-zinc-100 dark:focus:bg-zinc-900 text-sm">
                <Link2 className="size-4 text-zinc-400 mr-2" />
                Copy Embed Link
              </DropdownMenuItem>

              <DropdownMenuItem onClick={() => toast.error("Report submitted! Thank you.")} className="rounded-xl px-3 py-2 cursor-pointer focus:bg-red-50 dark:focus:bg-red-950/20 text-red-600 dark:text-red-400 text-sm font-semibold">
                <Flag className="size-4 mr-2" />
                Report Post
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {isDetail && replyToUsername && live.parentId && (
          <Link href={`/posts/${live.parentId}`} className="text-xs text-zinc-500 dark:text-zinc-400 hover:underline w-fit">
            {t("postDetail.replyingTo", { username: replyToUsername })}
          </Link>
        )}

        {/* Content body — opens the thread (only text, so lightbox portal clicks never bubble into navigation) */}
        <div
          onClick={openThread}
          className={`${isDetail ? "text-[17px]" : "text-sm cursor-pointer"} text-zinc-900 dark:text-zinc-200 leading-relaxed break-words pr-2`}
        >
          <RichContent content={live.content} highlightTokens={highlightTokens} />
        </div>

        {/* Dynamic Multi-image Grid rendering */}
        <PostMediaGrid images={images} onOpen={setLightboxIndex} />

        {isDetail && (
          <div className="flex items-center gap-4 pt-3 mt-1 border-t border-zinc-200/60 dark:border-zinc-900/60 text-sm text-zinc-500 dark:text-zinc-400">
            <span><strong className="text-black dark:text-white">{likesCount}</strong> {t("postDetail.likes")}</span>
            <span><strong className="text-black dark:text-white">{live.commentsCount}</strong> {t("postDetail.replies")}</span>
          </div>
        )}

        {/* Actions Toolbar */}
        <div className="flex items-center gap-6 mt-3 text-zinc-400 dark:text-zinc-500 pl-1 select-none">

          {/* Like pop trigger */}
          <div className="flex items-center gap-1.5 relative">
            {showSparkles && (
              <Sparkles className="absolute -top-6 -left-2 h-8 w-8 text-amber-400 fill-amber-300 animate-sparkle-burst pointer-events-none" />
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
            {likesCount > 0 && (
              <span className={`text-xs font-semibold ${isLiked ? "text-red-500 dark:text-red-450" : ""}`}>
                {likesCount}
              </span>
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
            {sharesCount > 0 && (
              <span className={`text-xs font-semibold ${shareCopied ? "text-green-500 dark:text-green-450" : ""}`}>
                {sharesCount}
              </span>
            )}
          </div>

        </div>

      </div>

      <PostLightbox
        images={images}
        index={lightboxIndex}
        onIndexChange={setLightboxIndex}
        onClose={() => setLightboxIndex(null)}
      />

    </article>
  );
}
export default PostCard;

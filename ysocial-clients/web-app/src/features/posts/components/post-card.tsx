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
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  X
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
import {
  Dialog,
  DialogContent,
  DialogPortal,
} from "@/components/ui/dialog";

export interface PostItem {
  id: string;
  content: string;
  imageUrl?: string;
  imageUrls?: string[]; // Added supporting multiple media uploads
  createdAt: string;
  likesCount: number;
  commentsCount: number;
  isLikedByCurrentUser: boolean;
  isBookmarkedByCurrentUser: boolean;
  user: {
    id: string;
    displayName: string;
    username: string;
    avatarUrl?: string;
    isVerified?: boolean;
  };
}

interface PostCardProps {
  post: PostItem;
  onLikeToggle?: (id: string, currentlyLiked: boolean) => Promise<void>;
  onBookmarkToggle?: (id: string, currentlyBookmarked: boolean) => Promise<void>;
  isAuthorFollowing?: boolean;
  onAuthorFollowToggle?: () => void;
}

export function PostCard({
  post,
  onLikeToggle,
  onBookmarkToggle,
  isAuthorFollowing,
  onAuthorFollowToggle,
}: PostCardProps) {
  const { t } = useTranslation();

  // Interactive Local states for optimistic rapid feedback
  const [isLiked, setIsLiked] = useState(post.isLikedByCurrentUser);
  const [likesCount, setLikesCount] = useState(post.likesCount);
  const [isBookmarked, setIsBookmarked] = useState(post.isBookmarkedByCurrentUser);
  const [bookmarksCount, setBookmarksCount] = useState(post.isBookmarkedByCurrentUser ? 12 : 11);
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

  // Lightbox Viewer States
  const [activeLightboxImage, setActiveLightboxImage] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Safely capture single image fallback or multi-image lists
  const images = post.imageUrls || (post.imageUrl ? [post.imageUrl] : []);

  // Monitor fullscreen API events to maintain exact UI states
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

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

  const handleLike = async () => {
    const nextState = !isLiked;
    setIsLiked(nextState);
    setLikesCount((prev) => (nextState ? prev + 1 : Math.max(0, prev - 1)));

    if (nextState) {
      setLikeAnimating(true);
      setShowSparkles(true);
      toast.success(t("card.likeSuccess"), { duration: 1500 });
      // Stop sparkles after 600ms
      setTimeout(() => setShowSparkles(false), 600);
    } else {
      toast.info(t("card.unlikeSuccess"), { duration: 1500 });
    }

    try {
      if (onLikeToggle) {
        await onLikeToggle(post.id, !nextState);
      }
    } catch {
      // Revert if error
      setIsLiked(!nextState);
      setLikesCount((prev) => (!nextState ? prev + 1 : Math.max(0, prev - 1)));
      toast.error(t("common.error"));
    }
  };

  const handleBookmark = async () => {
    const nextState = !isBookmarked;
    setIsBookmarked(nextState);
    setBookmarksCount((prev) => (nextState ? prev + 1 : Math.max(0, prev - 1)));
    setBookmarkAnimating(true);

    if (nextState) {
      toast.success(t("card.bookmarkSuccess"), { duration: 1500 });
    } else {
      toast.info(t("card.unbookmarkSuccess"), { duration: 1500 });
    }

    try {
      if (onBookmarkToggle) {
        await onBookmarkToggle(post.id, !nextState);
      }
    } catch {
      setIsBookmarked(!nextState);
      setBookmarksCount((prev) => (!nextState ? prev + 1 : Math.max(0, prev - 1)));
      toast.error(t("common.error"));
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

  // Lightbox Media Control Functions
  const handlePrevImage = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const prevIdx = (lightboxIndex - 1 + images.length) % images.length;
    setLightboxIndex(prevIdx);
    setActiveLightboxImage(images[prevIdx]);
  };

  const handleNextImage = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const nextIdx = (lightboxIndex + 1) % images.length;
    setLightboxIndex(nextIdx);
    setActiveLightboxImage(images[nextIdx]);
  };

  const toggleFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error("Fullscreen error:", err);
      });
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Render different multi-media grid configurations perfectly matching Threads/X layouts
  const renderMediaGrid = () => {
    if (images.length === 0) return null;

    if (images.length === 1) {
      return (
        <div
          onClick={() => {
            setLightboxIndex(0);
            setActiveLightboxImage(images[0]);
          }}
          className="mt-2 rounded-2xl overflow-hidden border border-zinc-200/50 dark:border-zinc-800/40 max-h-[350px] w-full bg-zinc-150 dark:bg-zinc-900 flex items-center justify-center relative shadow-sm cursor-zoom-in transition-all duration-300"
        >
          <img
            src={images[0]}
            alt="Post attachment"
            className="w-full h-full object-cover max-h-[350px] transition-transform duration-700 hover:scale-101"
            loading="lazy"
          />
        </div>
      );
    }

    if (images.length === 2) {
      return (
        <div className="mt-2 grid grid-cols-2 gap-1.5 rounded-2xl overflow-hidden max-h-[280px] w-full border border-zinc-200/50 dark:border-zinc-800/40 shadow-sm">
          {images.map((img, idx) => (
            <div
              key={idx}
              onClick={() => {
                setLightboxIndex(idx);
                setActiveLightboxImage(img);
              }}
              className="w-full h-full min-h-[160px] max-h-[280px] bg-zinc-150 dark:bg-zinc-900 cursor-zoom-in overflow-hidden relative group/img"
            >
              <img
                src={img}
                alt={`Attachment ${idx + 1}`}
                className="w-full h-full object-cover transition-transform duration-500 group-hover/img:scale-102"
              />
            </div>
          ))}
        </div>
      );
    }

    if (images.length === 3) {
      return (
        <div className="mt-2 grid grid-cols-2 gap-1.5 rounded-2xl overflow-hidden max-h-[320px] w-full border border-zinc-200/50 dark:border-zinc-800/40 shadow-sm">
          <div
            onClick={() => {
              setLightboxIndex(0);
              setActiveLightboxImage(images[0]);
            }}
            className="w-full h-full min-h-[240px] max-h-[320px] bg-zinc-150 dark:bg-zinc-900 cursor-zoom-in overflow-hidden relative group/img row-span-2"
          >
            <img
              src={images[0]}
              alt="Attachment 1"
              className="w-full h-full object-cover transition-transform duration-500 group-hover/img:scale-102"
            />
          </div>
          <div className="grid grid-rows-2 gap-1.5 h-full">
            {images.slice(1, 3).map((img, idx) => (
              <div
                key={idx}
                onClick={() => {
                  setLightboxIndex(idx + 1);
                  setActiveLightboxImage(img);
                }}
                className="w-full h-full min-h-[110px] max-h-[155px] bg-zinc-150 dark:bg-zinc-900 cursor-zoom-in overflow-hidden relative group/img"
              >
                <img
                  src={img}
                  alt={`Attachment ${idx + 2}`}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover/img:scale-102"
                />
              </div>
            ))}
          </div>
        </div>
      );
    }

    // 4 or more images grid configuration
    return (
      <div className="mt-2 grid grid-cols-2 grid-rows-2 gap-1.5 rounded-2xl overflow-hidden max-h-[350px] w-full border border-zinc-200/50 dark:border-zinc-800/40 shadow-sm">
        {images.slice(0, 4).map((img, idx) => {
          const isFourth = idx === 3;
          const extraCount = images.length - 4;
          return (
            <div
              key={idx}
              onClick={() => {
                setLightboxIndex(idx);
                setActiveLightboxImage(img);
              }}
              className="w-full h-full min-h-[120px] max-h-[170px] bg-zinc-150 dark:bg-zinc-900 cursor-zoom-in overflow-hidden relative group/img"
            >
              <img
                src={img}
                alt={`Attachment ${idx + 1}`}
                className="w-full h-full object-cover transition-transform duration-500 group-hover/img:scale-102"
              />
              {isFourth && extraCount > 0 && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white font-bold text-lg select-none">
                  +{extraCount}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <article className="w-full border-b border-zinc-200/60 dark:border-zinc-900/60 p-4 bg-white dark:bg-black/40 flex gap-3 items-start relative transition-colors duration-355 hover:bg-zinc-100/10 dark:hover:bg-zinc-900/10 group">

      {/* Left Column: Avatar & vertical Thread Line */}
      <div className="flex flex-col items-center self-stretch shrink-0">
        <Link href={`/@${post.user.username}`}>
          <Avatar className="h-10 w-10 border border-zinc-150 dark:border-zinc-850 shrink-0 hover:opacity-85 transition-opacity">
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
                <ShieldCheck className="h-4 w-4 text-blue-500 shrink-0 fill-blue-500/10" />
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
              {formatTime(post.createdAt)}
            </span>
          </div>

          {/* Triple-dot Dropdown actions */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 active:scale-95 shrink-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 rounded-2xl border-zinc-200/50 dark:border-zinc-900 bg-white dark:bg-zinc-950 p-2 shadow-xl z-30">
              <DropdownMenuItem onClick={() => toast.info(`Saved`)} className="rounded-xl px-3 py-2 cursor-pointer focus:bg-zinc-100 dark:focus:bg-zinc-900 text-sm">
                <Bookmark className="h-4 w-4 text-zinc-400 mr-2" />
                Save
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => toast.info(`Not interested`)} className="rounded-xl px-3 py-2 cursor-pointer focus:bg-zinc-100 dark:focus:bg-zinc-900 text-sm">
                <EyeOff className="h-4 w-4 text-zinc-400 mr-2" />
                Not interested
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-zinc-100 dark:bg-zinc-900" />
              <DropdownMenuItem onClick={() => toast.info(`Muted @${post.user.username}`)} className="rounded-xl px-3 py-2 cursor-pointer focus:bg-zinc-100 dark:focus:bg-zinc-900 text-sm">
                <VolumeX className="h-4 w-4 text-zinc-400 mr-2" />
                Mute @{post.user.username}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => toast.info(`Blocked @${post.user.username}`)} className="rounded-xl px-3 py-2 cursor-pointer focus:bg-zinc-100 dark:focus:bg-zinc-900 text-sm">
                <Ban className="h-4 w-4 text-zinc-400 mr-2" />
                Block @{post.user.username}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-zinc-100 dark:bg-zinc-900" />
              <DropdownMenuItem onClick={() => toast.success("Copied embed link to clipboard!")} className="rounded-xl px-3 py-2 cursor-pointer focus:bg-zinc-100 dark:focus:bg-zinc-900 text-sm">
                <Link2 className="h-4 w-4 text-zinc-400 mr-2" />
                Copy Embed Link
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => toast.error("Report submitted! Thank you.")} className="rounded-xl px-3 py-2 cursor-pointer focus:bg-red-50 dark:focus:bg-red-950/20 text-red-600 dark:text-red-400 text-sm font-semibold">
                <Flag className="h-4 w-4 mr-2" />
                Report Post
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Content body */}
        <div className="text-sm text-zinc-900 dark:text-zinc-200 leading-relaxed break-words pr-2">
          {post.content}
        </div>

        {/* Dynamic Multi-image Grid rendering */}
        {renderMediaGrid()}

        {/* Actions Toolbar */}
        <div className="flex items-center gap-6 mt-3 text-zinc-400 dark:text-zinc-500 pl-1 select-none">

          {/* Like pop trigger */}
          <div className="flex items-center gap-1.5 relative">
            {showSparkles && (
              <Sparkles className="absolute -top-6 -left-2 h-8 w-8 text-amber-400 fill-amber-300 animate-sparkle-burst pointer-events-none" />
            )}
            <button
              onClick={handleLike}
              onAnimationEnd={() => setLikeAnimating(false)}
              className={`p-1.5 rounded-full transition-all duration-300 hover:bg-red-50 dark:hover:bg-red-950/20 active:scale-75 ${isLiked
                ? "text-red-500 dark:text-red-400 animate-heart-pop"
                : "hover:text-red-500 dark:hover:text-red-400"
                } ${likeAnimating ? "animate-heart-pop" : ""}`}
            >
              <Heart className={`h-4.5 w-4.5 ${isLiked ? "fill-current" : ""}`} />
            </button>
            {likesCount > 0 && (
              <span className={`text-xs font-semibold ${isLiked ? "text-red-500 dark:text-red-450" : ""}`}>
                {likesCount}
              </span>
            )}
          </div>

          {/* Comment trigger */}
          <div className="flex items-center gap-1.5">
            <button className="p-1.5 rounded-full hover:bg-blue-50 dark:hover:bg-blue-950/20 hover:text-blue-500 dark:hover:text-blue-450 active:scale-75 transition-all">
              <MessageCircle className="h-4.5 w-4.5" />
            </button>
            {post.commentsCount > 0 && (
              <span className="text-xs font-semibold">{post.commentsCount}</span>
            )}
          </div>

          {/* Bookmark trigger with counters */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleBookmark}
              onAnimationEnd={() => setBookmarkAnimating(false)}
              className={`p-1.5 rounded-full hover:bg-amber-50 dark:hover:bg-amber-950/20 hover:text-amber-500 dark:hover:text-amber-450 active:scale-75 transition-all ${isBookmarked ? "text-amber-500 dark:text-amber-400" : ""
                } ${bookmarkAnimating ? "scale-105 duration-200" : ""}`}
            >
              <Bookmark className={`h-4.5 w-4.5 ${isBookmarked ? "fill-current" : ""}`} />
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
              onClick={handleShare}
              className={`p-1.5 rounded-full hover:bg-green-50 dark:hover:bg-green-950/20 hover:text-green-500 dark:hover:text-green-450 active:scale-75 transition-all duration-300 ${shareCopied ? "rotate-360 text-green-500 dark:text-green-400" : ""
                }`}
            >
              {shareCopied ? (
                <Check className="h-4.5 w-4.5 stroke-[3px] scale-105" />
              ) : (
                <Share2 className="h-4.5 w-4.5" />
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

      {/* ==================== HIGH-FIDELITY MEDIA LIGHTBOX VIEWER ==================== */}
      <Dialog
        open={!!activeLightboxImage}
        onOpenChange={(open) => {
          if (!open) {
            setActiveLightboxImage(null);
            if (document.fullscreenElement) {
              document.exitFullscreen().catch(() => { });
            }
          }
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-screen h-screen max-w-none sm:max-w-none max-h-none sm:max-h-none m-0 p-0 bg-black/95 border-none rounded-none outline-none flex flex-col items-center justify-center z-50"
        >
          {/* Top Toolbar Actions */}
          <div className="absolute top-6 right-6 z-55 flex items-center gap-4">
            {/* Fullscreen Button */}
            <button
              onClick={toggleFullscreen}
              className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all active:scale-90"
            >
              {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
            </button>

            {/* Close Button */}
            <button
              onClick={() => {
                setActiveLightboxImage(null);
                if (document.fullscreenElement) {
                  document.exitFullscreen().catch(() => { });
                }
              }}
              className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all active:scale-90"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Left navigation arrows for multi-image lightbox */}
          {images.length > 1 && (
            <button
              onClick={handlePrevImage}
              className="absolute left-6 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all active:scale-80 z-55 hidden md:block"
            >
              <ChevronLeft className="h-6 w-6 stroke-[3px]" />
            </button>
          )}

          {/* Main high-resolution image container */}
          {activeLightboxImage && (
            <img
              src={activeLightboxImage}
              alt="Full resolution viewer"
              className="max-w-[90vw] max-h-[85vh] object-contain select-none transition-transform duration-300"
            />
          )}

          {/* Right navigation arrows for multi-image lightbox */}
          {images.length > 1 && (
            <button
              onClick={handleNextImage}
              className="absolute right-6 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all active:scale-80 z-55 hidden md:block"
            >
              <ChevronRight className="h-6 w-6 stroke-[3px]" />
            </button>
          )}

          {/* Image pagination counter at the bottom */}
          {images.length > 1 && (
            <div className="absolute bottom-6 px-4 py-1.5 rounded-full bg-white/10 text-white text-xs font-semibold tracking-wider z-55">
              {lightboxIndex + 1} / {images.length}
            </div>
          )}

        </DialogContent>
      </Dialog>

    </article>
  );
}
export default PostCard;

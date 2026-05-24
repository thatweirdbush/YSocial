"use client";

import React, { useState } from "react";
import { 
  Heart, 
  MessageCircle, 
  Share2, 
  Bookmark, 
  MoreHorizontal, 
  Check, 
  Sparkles,
  ShieldCheck
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/use-translation";
import { toast } from "sonner";

export interface PostItem {
  id: string;
  content: string;
  imageUrl?: string;
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
}

export function PostCard({ post, onLikeToggle, onBookmarkToggle }: PostCardProps) {
  const { t } = useTranslation();
  
  // Interactive Local states for optimistic rapid feedback
  const [isLiked, setIsLiked] = useState(post.isLikedByCurrentUser);
  const [likesCount, setLikesCount] = useState(post.likesCount);
  const [isBookmarked, setIsBookmarked] = useState(post.isBookmarkedByCurrentUser);
  
  // Micro-UX Animation triggers
  const [likeAnimating, setLikeAnimating] = useState(false);
  const [showSparkles, setShowSparkles] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [bookmarkAnimating, setBookmarkAnimating] = useState(false);

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
      toast.success(t("card.copySuccess"));
      
      // Revert checkmark icon rotation after 2 seconds
      setTimeout(() => {
        setShareCopied(false);
      }, 2000);
    } catch {
      toast.error(t("common.error"));
    }
  };

  return (
    <article className="w-full border-b border-zinc-200/60 dark:border-zinc-900/60 p-4 bg-white dark:bg-black/40 flex gap-3 items-start relative transition-colors duration-350 hover:bg-zinc-100/10 dark:hover:bg-zinc-900/10 group">
      
      {/* Left Column: Avatar & vertical Thread Line */}
      <div className="flex flex-col items-center self-stretch shrink-0">
        <Avatar className="h-10 w-10 border border-zinc-150 dark:border-zinc-850 shrink-0">
          <AvatarImage src={post.user.avatarUrl} alt={post.user.displayName} />
          <AvatarFallback className="bg-zinc-200 dark:bg-zinc-800 text-xs font-semibold">
            {post.user.displayName.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        {/* Thread connector line running through */}
        <div className="w-[1.5px] grow bg-zinc-200 dark:bg-zinc-900 my-2 rounded-full opacity-60 group-hover:opacity-100 transition-opacity" />
      </div>

      {/* Right Column: User details, content, actions */}
      <div className="flex-1 flex flex-col gap-2 min-w-0">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-bold text-sm text-black dark:text-zinc-100 truncate hover:underline cursor-pointer">
              {post.user.displayName}
            </span>
            {post.user.isVerified && (
              <ShieldCheck className="h-4 w-4 text-blue-500 shrink-0 fill-blue-500/10" />
            )}
            <span className="text-zinc-400 dark:text-zinc-500 text-xs truncate">
              @{post.user.username}
            </span>
            <span className="text-zinc-300 dark:text-zinc-700 text-xs select-none">•</span>
            <span className="text-zinc-400 dark:text-zinc-500 text-xs">
              {formatTime(post.createdAt)}
            </span>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>

        {/* Content body */}
        <div className="text-sm text-zinc-900 dark:text-zinc-200 leading-relaxed break-words pr-2">
          {post.content}
        </div>

        {/* Optional Media Image rendering */}
        {post.imageUrl && (
          <div className="mt-2 rounded-2xl overflow-hidden border border-zinc-200/50 dark:border-zinc-800/40 max-h-[350px] w-full bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center relative shadow-sm group-hover:shadow-md transition-shadow">
            <img 
              src={post.imageUrl} 
              alt="Post attachment" 
              className="w-full h-full object-cover max-h-[350px] transition-transform duration-700 hover:scale-101"
              loading="lazy"
            />
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
              onClick={handleLike}
              onAnimationEnd={() => setLikeAnimating(false)}
              className={`p-1.5 rounded-full transition-all duration-300 hover:bg-red-50 dark:hover:bg-red-950/20 active:scale-75 ${
                isLiked 
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

          {/* Bookmark trigger */}
          <button
            onClick={handleBookmark}
            onAnimationEnd={() => setBookmarkAnimating(false)}
            className={`p-1.5 rounded-full hover:bg-amber-50 dark:hover:bg-amber-950/20 hover:text-amber-500 dark:hover:text-amber-450 active:scale-75 transition-all ${
              isBookmarked ? "text-amber-500 dark:text-amber-400" : ""
            } ${bookmarkAnimating ? "scale-105 duration-200" : ""}`}
          >
            <Bookmark className={`h-4.5 w-4.5 ${isBookmarked ? "fill-current" : ""}`} />
          </button>

          {/* Share with rotating checkmark transition */}
          <button
            onClick={handleShare}
            className={`p-1.5 rounded-full hover:bg-green-50 dark:hover:bg-green-950/20 hover:text-green-500 dark:hover:text-green-450 active:scale-75 transition-all duration-300 ${
              shareCopied ? "rotate-360 text-green-500 dark:text-green-400" : ""
            }`}
          >
            {shareCopied ? (
              <Check className="h-4.5 w-4.5 stroke-[3px] scale-105" />
            ) : (
              <Share2 className="h-4.5 w-4.5" />
            )}
          </button>

        </div>

      </div>
    </article>
  );
}
export default PostCard;

"use client";

import React, { useRef, useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Image as ImageIcon,
  Smile,
  Globe,
  Users,
  UserCheck,
  AtSign,
  MapPin,
  X,
  Plus,
  FileText,
  Trash2,
  MapPinned,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useTranslation } from "@/hooks/use-translation";
import { useAuthUser } from "@/features/auth/store/auth-store";
import { useDrafts, useDraftActions } from "../store/post-draft-store";
import { PostAudience } from "../types/creator";

const postSchema = z.object({
  content: z.string().max(500, "Content exceeds 500 characters limit"),
});

type PostFormValues = z.infer<typeof postSchema>;

export interface PostCreatorCoreRef {
  triggerClose: () => void;
}

interface PostCreatorCoreProps {
  draftId?: string;
  onPostSubmitted?: (content: string, images: string[], audience: PostAudience) => Promise<void>;
  onCancel?: () => void;
  onPopoverStateChange?: (isOpen: boolean) => void;
  onStateChange?: (hasUnsavedChanges: boolean) => void;
  isDialogMode?: boolean;
}

const SUGGESTED_PROFILES = [
  {
    username: "anquoc.dev",
    displayName: "Trần Anh Quốc",
    avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80",
  },
  {
    username: "hamy_cute",
    displayName: "Nguyễn Hà My",
    avatarUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=100&q=80",
  },
  {
    username: "ysocial_member",
    displayName: "YSocial Member",
    avatarUrl: "",
  },
  {
    username: "chong_iu",
    displayName: "Chồng Iu",
    avatarUrl: "",
  },
];

const MOCK_LOCATIONS = [
  "Hanoi, Vietnam",
  "Ho Chi Minh City, Vietnam",
  "Da Nang, Vietnam",
  "Silicon Valley, CA",
  "Tokyo, Japan",
  "Seoul, South Korea",
  "Paris, France",
  "London, UK",
];

const MOCK_GIFS = [
  "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3B5dmZobGFxM3pjOTBsd2UycHR6OXJtazg1czM0dHdqZHh0OGE0eSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/tJqyalvo9ahykfykAj/giphy.gif",
  "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3p4ZzBnbnd6b3A3djIyaHR5aGRkZzRyeG11MWhxZnU2cWR4Mm8wcyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/XIqCQx02EwFfG/giphy.gif",
  "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExYzgxMmFycTdzanExOWJia2FmdThrcDkwcWR5M3l2bjBzdXF4bjQ4NyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/l3q2zVr6cu95nF6O4/giphy.gif",
  "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExOXVjN3h0ZWRxMHpoZjBrdm1tN2szcXBwdXhkNDB0ZmRkc2p5eWk4ZSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3o7TKSjRrfIPjei1Hi/giphy.gif",
];

const MOCK_EMOJIS = ["😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "😇", "🙂", "🙃", "😉", "😌", "😍", "🥰", "😘", "😋", "😎", "🤩", "🥳", "😏", "👍", "🙌", "❤️", "🔥", "✨", "🎉"];

export const PostCreatorCore = forwardRef<PostCreatorCoreRef, PostCreatorCoreProps>((
  {
    draftId: initialDraftId,
    onPostSubmitted,
    onCancel,
    onPopoverStateChange,
    onStateChange,
    isDialogMode = false,
  },
  ref
) => {
  const { t } = useTranslation();
  const user = useAuthUser();
  const drafts = useDrafts();
  const { saveDraft, deleteDraft } = useDraftActions();

  // Core Form State
  const [activeDraftId, setActiveDraftId] = useState<string | undefined>(initialDraftId);
  const [images, setImages] = useState<string[]>([]);
  const [audience, setAudience] = useState<PostAudience>("anyone");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [location, setLocation] = useState<string | null>(null);

  // Sub-Popover States
  const [isAudienceOpen, setIsAudienceOpen] = useState(false);
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);
  const [isGifOpen, setIsGifOpen] = useState(false);
  const [isLocationOpen, setIsLocationOpen] = useState(false);
  const [isDraftsOpen, setIsDraftsOpen] = useState(false);
  const [isWarningOpen, setIsWarningOpen] = useState(false);

  // Mentions State
  const [isMentionsOpen, setIsMentionsOpen] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [mentionIndex, setMentionIndex] = useState(-1);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Image Drag Scrolling States
  const [isDragScrolling, setIsDragScrolling] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<PostFormValues>({
    resolver: zodResolver(postSchema),
    defaultValues: {
      content: "",
    },
    mode: "onChange",
  });

  const contentValue = watch("content");
  const isValid = contentValue.trim().length > 0 || images.length > 0;

  const { ref: contentRef, ...contentRegister } = register("content");

  // Imperative handle to trigger close and dialog safety checks
  useImperativeHandle(ref, () => ({
    triggerClose: () => {
      if (isValid) {
        setIsWarningOpen(true);
      } else {
        onCancel?.();
      }
    },
  }));

  // Track any open sub-popovers to notify escape shield
  const isAnySubPopoverOpen =
    isAudienceOpen ||
    isEmojiOpen ||
    isGifOpen ||
    isLocationOpen ||
    isDraftsOpen ||
    isMentionsOpen ||
    isWarningOpen;

  useEffect(() => {
    onPopoverStateChange?.(isAnySubPopoverOpen);
  }, [isAnySubPopoverOpen, onPopoverStateChange]);

  useEffect(() => {
    onStateChange?.(isValid);
  }, [isValid, onStateChange]);

  // Height auto grow
  const adjustHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  };

  useEffect(() => {
    adjustHeight();
  }, [contentValue]);

  // Local KeyDown listener for Popover Escape Shield
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      if (isMentionsOpen) {
        setIsMentionsOpen(false);
        e.stopPropagation();
        textareaRef.current?.focus();
        return;
      }
      if (isEmojiOpen) {
        setIsEmojiOpen(false);
        e.stopPropagation();
        return;
      }
      if (isGifOpen) {
        setIsGifOpen(false);
        e.stopPropagation();
        return;
      }
      if (isLocationOpen) {
        setIsLocationOpen(false);
        e.stopPropagation();
        return;
      }
      if (isAudienceOpen) {
        setIsAudienceOpen(false);
        e.stopPropagation();
        return;
      }
      if (isDraftsOpen) {
        setIsDraftsOpen(false);
        e.stopPropagation();
        return;
      }
      if (isWarningOpen) {
        setIsWarningOpen(false);
        e.stopPropagation();
        return;
      }
    }
  };

  // Textarea input watcher for mentions
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setValue("content", value);

    const caretPosition = e.target.selectionStart;
    const textBeforeCaret = value.substring(0, caretPosition);
    const lastAtIdx = textBeforeCaret.lastIndexOf("@");

    if (lastAtIdx !== -1) {
      const textAfterAt = textBeforeCaret.substring(lastAtIdx + 1);
      if (!textAfterAt.includes(" ") && !textAfterAt.includes("\n")) {
        setMentionSearch(textAfterAt);
        setIsMentionsOpen(true);
        setMentionIndex(lastAtIdx);
        return;
      }
    }
    setIsMentionsOpen(false);
  };

  const handleSelectMention = (username: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const value = watch("content");
    const beforeMention = value.substring(0, mentionIndex);
    const afterMention = value.substring(textarea.selectionStart);
    const newValue = `${beforeMention}@${username} ${afterMention}`;

    setValue("content", newValue);
    setIsMentionsOpen(false);

    setTimeout(() => {
      textarea.focus();
      const newCursorPos = beforeMention.length + username.length + 2;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 50);
  };

  // Image Drag scrolling
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollContainerRef.current) return;
    setIsDragScrolling(true);
    setStartX(e.pageX - scrollContainerRef.current.offsetLeft);
    setScrollLeft(scrollContainerRef.current.scrollLeft);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragScrolling || !scrollContainerRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollContainerRef.current.offsetLeft;
    const walk = (x - startX) * 1.5;
    scrollContainerRef.current.scrollLeft = scrollLeft - walk;
  };

  const handleMouseUpOrLeave = () => {
    setIsDragScrolling(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.shiftKey && scrollContainerRef.current) {
      e.preventDefault();
      scrollContainerRef.current.scrollLeft += e.deltaY;
    }
  };

  // Attachment controls
  const handleAddMockImage = () => {
    const mockImage = `https://images.unsplash.com/photo-${1500000000000 + Math.floor(Math.random() * 1000000)
      }?auto=format&fit=crop&w=600&q=80`;
    setImages((prev) => [...prev, mockImage]);

    // Auto scroll horizontally to the end
    setTimeout(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollLeft = scrollContainerRef.current.scrollWidth;
      }
    }, 100);
  };

  const handleRemoveImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddGif = (gifUrl: string) => {
    setImages((prev) => [...prev, gifUrl]);
    setIsGifOpen(false);
  };

  const handleAddEmoji = (emoji: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const value = watch("content");
    const caretPosition = textarea.selectionStart;
    const beforeText = value.substring(0, caretPosition);
    const afterText = value.substring(caretPosition);
    const newValue = beforeText + emoji + afterText;

    setValue("content", newValue);
    setIsEmojiOpen(false);

    setTimeout(() => {
      textarea.focus();
      const newPos = caretPosition + emoji.length;
      textarea.setSelectionRange(newPos, newPos);
    }, 50);
  };

  // Drafts Operations
  const handleSaveToDrafts = () => {
    const content = watch("content");
    if (!content.trim() && images.length === 0) return;
    const savedId = saveDraft(content, images, audience, activeDraftId);
    setActiveDraftId(savedId);
    alert(t("creator.draftSaved") || "Draft saved!");
    setIsDraftsOpen(false);
  };

  const handleSaveToDraftsAndClose = () => {
    const content = watch("content");
    saveDraft(content, images, audience, activeDraftId);
    reset();
    setImages([]);
    setLocation(null);
    setIsWarningOpen(false);
    onCancel?.();
  };

  const handleDiscardAndClose = () => {
    if (activeDraftId) {
      deleteDraft(activeDraftId);
    }
    reset();
    setImages([]);
    setLocation(null);
    setIsWarningOpen(false);
    onCancel?.();
  };

  const handleRestoreDraft = (draft: any) => {
    setValue("content", draft.content);
    setImages(draft.images);
    setAudience(draft.audience);
    setActiveDraftId(draft.id);
    setIsDraftsOpen(false);
  };

  // Submit creator content
  const handleFormSubmit = async (data: PostFormValues) => {
    if (!isValid || isSubmitting) return;
    setIsSubmitting(true);
    try {
      if (onPostSubmitted) {
        await onPostSubmitted(data.content, images, audience);
      }
      if (activeDraftId) {
        deleteDraft(activeDraftId);
      }
      reset();
      setImages([]);
      setLocation(null);
      setAudience("anyone");
      setActiveDraftId(undefined);
    } catch (err) {
      console.error("Failed to submit post", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredProfiles = SUGGESTED_PROFILES.filter((profile) =>
    profile.username.toLowerCase().includes(mentionSearch.toLowerCase()) ||
    profile.displayName.toLowerCase().includes(mentionSearch.toLowerCase())
  );

  return (
    <div
      onKeyDown={handleKeyDown}
      className="w-full flex gap-3 items-start relative select-none"
    >
      <Avatar className="h-10 w-10 border border-zinc-150 dark:border-zinc-850 shrink-0">
        <AvatarImage src={user?.avatarUrl || "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=100&q=80"} />
        <AvatarFallback className="bg-zinc-200 dark:bg-zinc-800 text-xs font-bold">Y</AvatarFallback>
      </Avatar>

      <div className="flex-grow flex flex-col min-w-0 relative">
        <form onSubmit={handleSubmit(handleFormSubmit)} className="flex flex-col gap-2">
          {/* Main User Username Info */}
          <div className="flex items-center gap-1.5 text-xs text-zinc-500 font-bold tracking-tight">
            <span>{user?.displayName || "YSocial Member"}</span>
            <span className="text-zinc-400">@{user?.username || "ysocial_member"}</span>
            {location && (
              <span className="flex items-center text-zinc-400 dark:text-zinc-500 font-medium">
                <MapPin className="size-3 mr-0.5" />
                {location}
              </span>
            )}
          </div>

          {/* Borderless Expanding Textarea */}
          <textarea
            {...contentRegister}
            ref={(e) => {
              contentRef(e);
              textareaRef.current = e;
            }}
            onChange={handleTextareaChange}
            placeholder={t("creator.placeholder") || "What's new?"}
            className="w-full bg-transparent border-none outline-none resize-none text-zinc-950 dark:text-zinc-100 placeholder-zinc-400 text-md min-h-[50px] py-1 max-h-[250px] leading-relaxed"
            maxLength={500}
          />

          {/* Mentions Autocomplete Box */}
          {isMentionsOpen && filteredProfiles.length > 0 && (
            <div className="absolute top-16 left-0 z-40 w-64 rounded-2xl border border-zinc-100 dark:border-zinc-900 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md p-1.5 shadow-xl animate-in fade-in slide-in-from-top-2 duration-200 max-h-48 overflow-y-auto">
              <div className="text-[10px] uppercase font-bold text-zinc-400 px-2 py-1 tracking-wider border-b border-zinc-100 dark:border-zinc-900/60 mb-1">
                {t("creator.mentionSearchPlaceholder") || "Mention suggestions"}
              </div>
              {filteredProfiles.map((profile) => (
                <button
                  key={profile.username}
                  type="button"
                  onClick={() => handleSelectMention(profile.username)}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900 text-left transition-colors cursor-pointer"
                >
                  <Avatar className="size-6 shrink-0 border border-zinc-100 dark:border-zinc-800">
                    <AvatarImage src={profile.avatarUrl} />
                    <AvatarFallback className="text-[10px] font-bold">U</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 truncate">{profile.displayName}</span>
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate">@{profile.username}</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Horizontal Images previews list */}
          {images.length > 0 && (
            <div
              ref={scrollContainerRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUpOrLeave}
              onMouseLeave={handleMouseUpOrLeave}
              onWheel={handleWheel}
              className="flex flex-row gap-2 overflow-x-auto no-scrollbar w-full py-2 cursor-grab active:cursor-grabbing select-none"
            >
              {images.map((img, idx) => (
                <div
                  key={idx}
                  className="relative shrink-0 w-44 h-44 rounded-2xl overflow-hidden border border-zinc-150 dark:border-zinc-900 shadow-sm transition-all"
                >
                  <img
                    src={img}
                    alt={`Preview ${idx + 1}`}
                    className="w-full h-full object-cover pointer-events-none"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveImage(idx)}
                    className="absolute top-2 right-2 size-6 rounded-full bg-black/75 hover:bg-black text-white flex items-center justify-center border border-white/20 transition-all cursor-pointer"
                  >
                    <X className="size-3 shrink-0" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Tools Menu Bar */}
          <div className="flex items-center gap-1 border-t border-zinc-100 dark:border-zinc-900/60 pt-2.5">
            {/* Image attachment */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleAddMockImage}
              className="h-8 w-8 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-transform active:scale-95 cursor-pointer"
              title={t("creator.attachment") || "Attach an image"}
            >
              <ImageIcon className="h-4 w-4 shrink-0" />
            </Button>

            {/* GIF */}
            <div className="relative">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => {
                  setIsGifOpen(!isGifOpen);
                  setIsEmojiOpen(false);
                  setIsLocationOpen(false);
                  setIsAudienceOpen(false);
                }}
                className={`h-8 w-8 rounded-xl text-xs font-extrabold border-0 transition-all cursor-pointer ${isGifOpen
                  ? "bg-zinc-150 border-zinc-300 text-zinc-900 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-100"
                  : "border-zinc-200 dark:border-zinc-800/80 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-100"
                  }`}
                title={t("creator.addMockGif") || "Add GIF"}
              >
                GIF
              </Button>
              {isGifOpen && (
                <div className="absolute bottom-10 left-0 z-30 w-64 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md p-2 shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <div className="text-[10px] font-bold uppercase text-zinc-400 px-2 py-1 mb-1.5 border-b border-zinc-100 dark:border-zinc-900/60">
                    {t("creator.addMockGif") || "Select GIF"}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
                    {MOCK_GIFS.map((gif, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleAddGif(gif)}
                        className="rounded-xl overflow-hidden h-20 border border-zinc-100 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-650 cursor-pointer transition-all"
                      >
                        <img src={gif} className="w-full h-full object-cover" alt={`Mock GIF ${idx}`} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Emoji */}
            <div className="relative">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => {
                  setIsEmojiOpen(!isEmojiOpen);
                  setIsGifOpen(false);
                  setIsLocationOpen(false);
                  setIsAudienceOpen(false);
                }}
                className="h-8 w-8 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-transform active:scale-95 cursor-pointer"
                title={t("creator.addMockEmoji") || "Add Emoji"}
              >
                <Smile className="h-4 w-4 shrink-0" />
              </Button>
              {isEmojiOpen && (
                <div className="absolute bottom-10 left-0 z-30 w-56 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md p-2 shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <div className="grid grid-cols-6 gap-1 max-h-40 overflow-y-auto pr-1">
                    {MOCK_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => handleAddEmoji(emoji)}
                        className="h-8 w-8 text-md rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 flex items-center justify-center cursor-pointer transition-colors"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Location */}
            <div className="relative">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => {
                  setIsLocationOpen(!isLocationOpen);
                  setIsGifOpen(false);
                  setIsEmojiOpen(false);
                  setIsAudienceOpen(false);
                }}
                className="h-8 w-8 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-transform active:scale-95 cursor-pointer"
                title={t("creator.addMockLocation") || "Add Location"}
              >
                <MapPin className="h-4 w-4 shrink-0" />
              </Button>
              {isLocationOpen && (
                <div className="absolute bottom-10 left-0 z-30 w-64 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md p-2 shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <div className="text-[10px] font-bold uppercase text-zinc-400 px-2 py-1 mb-1.5 border-b border-zinc-100 dark:border-zinc-900/60 flex items-center gap-1">
                    <MapPinned className="size-3" />
                    <span>{t("creator.location") || "Select location"}</span>
                  </div>
                  <div className="flex flex-col max-h-40 overflow-y-auto pr-1">
                    {MOCK_LOCATIONS.map((loc) => (
                      <button
                        key={loc}
                        type="button"
                        onClick={() => {
                          setLocation(loc);
                          setIsLocationOpen(false);
                        }}
                        className="w-full text-left text-xs px-2.5 py-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 truncate cursor-pointer transition-colors"
                      >
                        {loc}
                      </button>
                    ))}
                    {location && (
                      <button
                        type="button"
                        onClick={() => {
                          setLocation(null);
                          setIsLocationOpen(false);
                        }}
                        className="w-full text-center text-xs font-bold text-red-500 px-2.5 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 border-t border-zinc-100 dark:border-zinc-900/60 mt-1 cursor-pointer transition-colors"
                      >
                        Clear Location
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Drafts Trigger */}
            <div className="relative">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => {
                  setIsDraftsOpen(!isDraftsOpen);
                  setIsGifOpen(false);
                  setIsEmojiOpen(false);
                  setIsLocationOpen(false);
                  setIsAudienceOpen(false);
                }}
                className="h-8 w-8 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-transform active:scale-95 cursor-pointer relative"
                title={t("creator.drafts") || "Drafts"}
              >
                <FileText className="h-4 w-4 shrink-0" />
                {drafts.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 size-2 bg-zinc-950 dark:bg-white rounded-full border border-white dark:border-black shrink-0" />
                )}
              </Button>

              {/* Drafts popover overlay inside the card */}
              {isDraftsOpen && (
                <div className="absolute bottom-10 left-0 z-30 w-72 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200 flex flex-col gap-2">
                  <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-900/60 pb-2 mb-1">
                    <span className="text-xs font-extrabold text-zinc-900 dark:text-zinc-50">{t("creator.drafts") || "Drafts"}</span>
                    {isValid && (
                      <button
                        type="button"
                        onClick={handleSaveToDrafts}
                        className="text-[10px] font-bold text-zinc-650 dark:text-zinc-300 hover:text-black dark:hover:text-white border border-zinc-200 dark:border-zinc-800 px-2 py-0.5 rounded-full cursor-pointer transition-colors"
                      >
                        {t("creator.saveDraft") || "Save Current"}
                      </button>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 max-h-52 overflow-y-auto pr-1">
                    {drafts.length === 0 ? (
                      <div className="text-[11px] text-zinc-400 py-6 text-center select-none">
                        {t("creator.noDrafts") || "No drafts saved yet"}
                      </div>
                    ) : (
                      drafts.map((draft) => (
                        <div
                          key={draft.id}
                          className="flex flex-col p-2.5 rounded-xl border border-zinc-100 dark:border-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/20 gap-1.5 transition-all text-left"
                        >
                          <p className="text-[11px] text-zinc-800 dark:text-zinc-200 line-clamp-2 leading-relaxed">
                            {draft.content || <span className="italic text-zinc-400">[Only image attachments]</span>}
                          </p>
                          {draft.images.length > 0 && (
                            <span className="text-[10px] text-zinc-400 flex items-center gap-1">
                              <ImageIcon className="size-3" />
                              {draft.images.length} image(s)
                            </span>
                          )}
                          <div className="flex items-center justify-between border-t border-zinc-100/60 dark:border-zinc-800/40 pt-1.5 mt-0.5">
                            <span className="text-[9px] text-zinc-400 dark:text-zinc-500">
                              {new Date(draft.createdAt).toLocaleDateString()}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleRestoreDraft(draft)}
                                className="text-[10px] font-bold text-zinc-950 dark:text-zinc-50 hover:underline cursor-pointer"
                              >
                                {t("creator.restore") || "Restore"}
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteDraft(draft.id)}
                                className="text-zinc-400 hover:text-red-500 p-0.5 cursor-pointer transition-colors"
                                title="Delete Draft"
                              >
                                <Trash2 className="size-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Divider */}
          <div className="h-[1px] bg-zinc-100 dark:bg-zinc-900/60 my-1" />

          {/* Options & Action Footer */}
          <div className="flex items-center justify-between">
            {/* Post Option Audience Toggle */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setIsAudienceOpen(!isAudienceOpen);
                  setIsGifOpen(false);
                  setIsEmojiOpen(false);
                  setIsLocationOpen(false);
                  setIsDraftsOpen(false);
                }}
                className="h-8 flex items-center gap-1.5 px-3 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors text-xs font-bold whitespace-nowrap tracking-tight cursor-pointer"
              >
                {audience === "anyone" && <Globe className="size-3.5 shrink-0" />}
                {audience === "followers" && <Users className="size-3.5 shrink-0" />}
                {audience === "following" && <UserCheck className="size-3.5 shrink-0" />}
                {audience === "mention" && <AtSign className="size-3.5 shrink-0" />}
                <span>
                  {audience === "anyone" && (t("creator.anyone") || "Anyone can reply")}
                  {audience === "followers" && (t("creator.followers") || "Your followers")}
                  {audience === "following" && (t("creator.following") || "Profiles you follow")}
                  {audience === "mention" && (t("creator.mention") || "Profiles you mention")}
                </span>
              </button>

              {isAudienceOpen && (
                <div className="absolute bottom-10 left-0 z-30 w-60 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md p-1.5 shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <div className="text-[10px] font-bold uppercase text-zinc-400 px-3 py-1 mb-1 tracking-wider">
                    {t("creator.audience") || "Post Options"}
                  </div>
                  {[
                    { id: "anyone", label: t("creator.anyone") || "Anyone can reply", icon: Globe },
                    { id: "followers", label: t("creator.followers") || "Your followers", icon: Users },
                    { id: "following", label: t("creator.following") || "Profiles you follow", icon: UserCheck },
                    { id: "mention", label: t("creator.mention") || "Profiles you mention", icon: AtSign },
                  ].map((opt) => {
                    const OptIcon = opt.icon;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setAudience(opt.id as PostAudience);
                          setIsAudienceOpen(false);
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left text-xs cursor-pointer transition-colors ${audience === opt.id
                          ? "bg-zinc-100 dark:bg-zinc-900 text-black dark:text-white font-bold"
                          : "text-zinc-650 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                          }`}
                      >
                        <OptIcon className="size-3.5 shrink-0 text-zinc-400" />
                        <span className="truncate">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Character counter & Post submit action */}
            <div className="flex items-center gap-3">
              {contentValue.length > 0 && (
                <span className={`text-xs ${contentValue.length > 450 ? "text-amber-500 font-bold animate-pulse" : "text-zinc-400"}`}>
                  {contentValue.length}/500
                </span>
              )}

              <div className="flex items-center gap-2">
                <Button
                  type="submit"
                  disabled={!isValid || isSubmitting}
                  className="rounded-full px-5 py-1.5 h-9 font-semibold text-sm bg-zinc-950 dark:bg-zinc-50 text-white dark:text-black hover:bg-zinc-850 dark:hover:bg-zinc-200 transition-all duration-300 disabled:opacity-40 active:scale-95 shrink-0 cursor-pointer"
                >
                  {isSubmitting ? t("creator.posting") || "Posting..." : t("creator.post") || "Post"}
                </Button>
              </div>
            </div>
          </div>
        </form>

        {/* Warning Discard Draft Overlay Alert Modal */}
        {isWarningOpen && (
          <div className="absolute -inset-x-4 -inset-y-4 z-50 bg-black/45 dark:bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200 rounded-3xl">
            <div className="bg-white dark:bg-zinc-950 border border-zinc-150 dark:border-zinc-900 rounded-3xl p-6 max-w-[280px] w-full shadow-2xl flex flex-col gap-4 text-center animate-in zoom-in-95 duration-200">
              <div className="mx-auto size-12 rounded-full bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center text-zinc-900 dark:text-zinc-50">
                <ShieldAlert className="size-6 text-zinc-950 dark:text-zinc-100" />
              </div>
              <div className="flex flex-col gap-1">
                <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-50 uppercase tracking-wider">
                  {t("creator.unsavedTitle") || "Discard post?"}
                </h3>
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  {t("creator.unsavedDesc") || "You have unsaved changes. Do you want to save this post as a draft or discard it?"}
                </p>
              </div>
              <div className="flex flex-col gap-1.5 mt-1">
                <button
                  type="button"
                  onClick={handleSaveToDraftsAndClose}
                  className="w-full h-8 rounded-xl bg-zinc-950 dark:bg-zinc-50 text-white dark:text-black font-bold text-xs hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all cursor-pointer"
                >
                  {t("creator.saveDraft") || "Save Draft"}
                </button>
                <button
                  type="button"
                  onClick={handleDiscardAndClose}
                  className="w-full h-8 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-red-50 dark:hover:bg-red-950/20 text-red-500 font-bold text-xs transition-all cursor-pointer"
                >
                  {t("creator.discard") || "Discard"}
                </button>
                <button
                  type="button"
                  onClick={() => setIsWarningOpen(false)}
                  className="w-full h-8 rounded-xl text-zinc-500 dark:text-zinc-400 font-bold text-xs hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-all cursor-pointer"
                >
                  {t("creator.keepEditing") || "Keep editing"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

PostCreatorCore.displayName = "PostCreatorCore";
export default PostCreatorCore;

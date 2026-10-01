"use client";

import React, { useRef, useState, useEffect, forwardRef, useImperativeHandle, useCallback, useMemo } from "react";
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
  FileText,
  Trash2,
  MapPinned,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useTranslation } from "@/hooks/use-translation";
import { useAuthUser } from "@/features/auth/store/auth-store";
import { useDrafts, useDraftActions } from "../store/post-draft-store";
import type { PostAudience } from "../types";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { DiscardWarningDialog } from "./discard-warning-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

const postSchema = z.object({
  content: z.string().max(500, "Content exceeds 500 characters limit"),
});

type PostFormValues = z.infer<typeof postSchema>;

export interface PostCreatorCoreRef {
  triggerClose: () => void;
  handleInlineEscape: () => boolean;
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
  "Nha Trang, Vietnam",
  "Hue, Vietnam",
  "Phu Quoc, Vietnam",
  "Sapa, Vietnam",
  "Ha Long Bay, Vietnam",
  "Silicon Valley, CA",
  "New York City, NY",
  "Los Angeles, CA",
  "Tokyo, Japan",
  "Kyoto, Japan",
  "Osaka, Japan",
  "Seoul, South Korea",
  "Busan, South Korea",
  "Singapore",
  "Bangkok, Thailand",
  "Paris, France",
  "London, UK",
  "Berlin, Germany",
  "Sydney, Australia",
  "Toronto, Canada"
];

const MOCK_GIFS = [
  // Trending
  { url: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3B5dmZobGFxM3pjOTBsd2UycHR6OXJtazg1czM0dHdqZHh0OGE0eSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/tJqyalvo9ahykfykAj/giphy.gif", category: "Trending", name: "dog wave" },
  { url: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3p4ZzBnbnd6b3A3djIyaHR5aGRkZzRyeG11MWhxZnU2cWR4Mm8wcyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/XIqCQx02EwFfG/giphy.gif", category: "Trending", name: "cat wave" },
  { url: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExYzgxMmFycTdzanExOWJia2FmdThrcDkwcWR5M3l2bjBzdXF4bjQ4NyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/l3q2zVr6cu95nF6O4/giphy.gif", category: "Trending", name: "applause thumbs up" },
  { url: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExOXVjN3h0ZWRxMHpoZjBrdm1tN2szcXBwdXhkNDB0ZmRkc2p5eWk4ZSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3o7TKSjRrfIPjei1Hi/giphy.gif", category: "Trending", name: "high five" },
  { url: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNWd5cnNxdHRpMW54cmNqYWgzaWswMGwzY3J3eTBkOW96c21ocW1xdyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/26AHONQ79uqx89qtO/giphy.gif", category: "Trending", name: "happy dance" },
  { url: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExMWs0NXBxZzhubXZ5dDR2ZHR5NnZibzN1dGV1bGNmOTk5bnlkOTFmYSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/111ebonMs90YLu/giphy.gif", category: "Trending", name: "surprised cat" },
  { url: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3F3cXR6ZjM5NDV5b3I4NDhrcHpvMmp2OG1iY2dweXZ0bGN3bjNvdSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/L2z7dnOduqEow/giphy.gif", category: "Trending", name: "minion celebrate" },
  { url: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExOHIxbmltMHc0bjI4bzB6ZjBhZmxxZzdwbXp5ZHQwb2tjcjM3Mnd0diZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/w8f283BIGaeHoIFxI5/giphy.gif", category: "Trending", name: "homer bush hide" },
  { url: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNWswZHJ3MXVnZWkyY2RraWtzcDZ2Mm9yOGlhazVyMnZ0enphdHplciZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/B1natt9SSy8es/giphy.gif", category: "Trending", name: "facepalm cat" },
  { url: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3Q3eDRiNWYwMHV1azRwN2h2MWlpcHN6NXp5MDFpdW0xNXZqdGthMSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/j9q3K89Jv0hW0/giphy.gif", category: "Trending", name: "shiba wtf" },
  // Reactions
  { url: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExczVxYjdsdnp6YTB5Zmt6ZnJvYnl1cmE4azN4a3dvdGFqZWZ5djNqdyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/l0ExdHfRppM4QHn1u/giphy.gif", category: "Reactions", name: "yes nod" },
  { url: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExY3MyeDN1ZDRrc3RxamVwbTJ4dG84bzBpeG55djRyMTF1eTlpOHVzNiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/spfi6nab5LMw8/giphy.gif", category: "Reactions", name: "no shake head" },
  { url: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExN3QzYzgxMTM3OHV1NmZnbXN1dzc2N2IybHR1dnV4MW40bHZyZGszNyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/AAsj7jWA9UMTu/giphy.gif", category: "Reactions", name: "confused child" },
  { url: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExOXVnd2Zmd2xhaXZsZ3I4azRvdTZwZHk3bnd5bzNzb29tN2NtcGcxNyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/9Y5BbDSkSTiY8/giphy.gif", category: "Reactions", name: "mindblown" },
  { url: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExMGx5OWZrbnZidmhpdnkxa2tsZmtpYWZ3cHN2dmh4dzRwODN4MGV1ayZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3ELney5fUXpq3MeV5C/giphy.gif", category: "Reactions", name: "nervous sweat" },
  { url: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExMTB2dzRndWRxb2cxbTBydW5zdm5oOTAwZ2k0aXRsd245NHl4Z2ZmdyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/13GKP7ACGjVK9y/giphy.gif", category: "Reactions", name: "popcorn eating" },
  { url: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExOXl2NXZpdXhyeDN0aXZnbXZ6MmJraGFpdDlvZHhxYTd5MG1odDZubCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/l3q2K5M6yPP2RQGZU/giphy.gif", category: "Reactions", name: "clapping congrats" },
  { url: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExOHV6cG1ocTR2OHFpaTJrbnh5Zmd0ZXF2NmxxN244OHl6Mmg0Nmh1ZiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/t3dLybaL7RefY2JJJ9/giphy.gif", category: "Reactions", name: "shocked expression" },
  { url: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExdm4wdHAyc3ptbXB6NHh1cmh1aTFmdmtwZmhwdW8yYzJkMDhxOW5jcyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/T2N5xfQecqyYw/giphy.gif", category: "Reactions", name: "cry puppy eyes" },
  { url: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3Z6cGNkMDR6ZHlhZzJvMnVpczJ1NTRqZGdxeDY4azl5bWoxbzhubyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/26FPon5fbbqH2q88w/giphy.gif", category: "Reactions", name: "wink blink" },
  // Memes & Fun
  { url: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExdzdxN2xpeHAycTN3amoxM2tqaHhrNWVud3lhNmQ3ejh6NnQ2eDR4eSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/Ju7l5ywymgYaI/giphy.gif", category: "Memes", name: "rickroll rick astley" },
  { url: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNmtpODJ4bWF1MGdta2NqMGRqYXF0dWU5dDhyOW1yZDF0MzAwaGkwaCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/KanqJsZukqg3FhVWYW/giphy.gif", category: "Memes", name: "doge raise paw" },
  { url: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExOXpqOW54ZHdzZzhwdjAyc3pxcWpyNjV4ZzA4bThmaDFxZnhiZXgyNyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/a3IWyYGLbkVW8/giphy.gif", category: "Memes", name: "pingu noot noot" },
  { url: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNHY2bWNscjRucndjbnlhMnV2c3p1YmNzbzIxcWFpdnhtNWxmeWNuMCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/9sDNyvlqFxO6Y/giphy.gif", category: "Memes", name: "pepe frog happy" },
  { url: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExZHhjcThhdzQwaGNxMmZ4dHdyN29maTZodmt6Nm5ubHR4dzZmdDdtbSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/eOXMGF4lgMPle/giphy.gif", category: "Memes", name: "surprised pikachu" },
  { url: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExMTI1dzJ0N2M5MHU3NnhyMXNydHlncHpiamtzazZ0cWphY2Q4aHk5NSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/bef5Fn7091y9O/giphy.gif", category: "Memes", name: "success kid" },
  { url: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExMXl2bXVjYnd6YW04MWdmdzhzdHloZmp0ajEyaG1zM2x4OWpsdnptMSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/l0HlTy9x8FxvZyK2k/giphy.gif", category: "Memes", name: "sloth slow wave" },
  { url: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExN3F2bmd5ZnN1dmQybDF5MXN4dmNmaHN4OWI2aDN4Y205ZHl6OWs2ayZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/134DVXcD94s3YI/giphy.gif", category: "Memes", name: "sad cat crying" },
  { url: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExMm9pMXl4NGwwczN0N2h3Ynd2NDB2OWFjcDRobmtjMmN3ZHlrbndmdyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/vFKqnCdLPNOKc/giphy.gif", category: "Memes", name: "crying cat loading" },
  { url: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3Z0bjJybG9xNDdsdm0wdzdzMmZtdjZscHR5azA3ejZ0ZXNnZHZnaCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/XreQmk7ETCPhS/giphy.gif", category: "Memes", name: "dancing baby" }
];

const MOCK_EMOJIS = [
  // Smileys
  { char: "😀", category: "Smileys" },
  { char: "😃", category: "Smileys" },
  { char: "😄", category: "Smileys" },
  { char: "😁", category: "Smileys" },
  { char: "😆", category: "Smileys" },
  { char: "😅", category: "Smileys" },
  { char: "😂", category: "Smileys" },
  { char: "🤣", category: "Smileys" },
  { char: "😊", category: "Smileys" },
  { char: "😇", category: "Smileys" },
  { char: "🙂", category: "Smileys" },
  { char: "🙃", category: "Smileys" },
  { char: "😉", category: "Smileys" },
  { char: "😌", category: "Smileys" },
  // Hearts & Gestures
  { char: "😍", category: "Hearts & Gestures" },
  { char: "🥰", category: "Hearts & Gestures" },
  { char: "😘", category: "Hearts & Gestures" },
  { char: "😋", category: "Hearts & Gestures" },
  { char: "😎", category: "Hearts & Gestures" },
  { char: "🤩", category: "Hearts & Gestures" },
  { char: "🥳", category: "Hearts & Gestures" },
  { char: "😏", category: "Hearts & Gestures" },
  { char: "👍", category: "Hearts & Gestures" },
  { char: "👎", category: "Hearts & Gestures" },
  { char: "🙌", category: "Hearts & Gestures" },
  { char: "👏", category: "Hearts & Gestures" },
  { char: "🤝", category: "Hearts & Gestures" },
  { char: "🙏", category: "Hearts & Gestures" },
  { char: "❤️", category: "Hearts & Gestures" },
  { char: "🧡", category: "Hearts & Gestures" },
  { char: "💛", category: "Hearts & Gestures" },
  { char: "💚", category: "Hearts & Gestures" },
  { char: "💙", category: "Hearts & Gestures" },
  { char: "💜", category: "Hearts & Gestures" },
  { char: "🖤", category: "Hearts & Gestures" },
  { char: "🤍", category: "Hearts & Gestures" },
  // Nature & Objects
  { char: "🔥", category: "Nature & Objects" },
  { char: "✨", category: "Nature & Objects" },
  { char: "🎉", category: "Nature & Objects" },
  { char: "🌟", category: "Nature & Objects" },
  { char: "🐶", category: "Nature & Objects" },
  { char: "🐱", category: "Nature & Objects" },
  { char: "🐭", category: "Nature & Objects" },
  { char: "🐹", category: "Nature & Objects" },
  { char: "🐰", category: "Nature & Objects" },
  { char: "🦊", category: "Nature & Objects" },
  { char: "🐻", category: "Nature & Objects" },
  { char: "🐼", category: "Nature & Objects" },
];

// Optimized sub-component to display image previews under React.memo
interface ImagePreviewListProps {
  images: string[];
  onRemoveImage: (index: number) => void;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseUpOrLeave: () => void;
  onWheel: (e: React.WheelEvent) => void;
}

const ImagePreviewList = React.memo(({
  images,
  onRemoveImage,
  scrollContainerRef,
  onMouseDown,
  onMouseMove,
  onMouseUpOrLeave,
  onWheel,
}: ImagePreviewListProps) => {
  if (images.length === 0) return null;
  return (
    <div
      ref={scrollContainerRef}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUpOrLeave}
      onMouseLeave={onMouseUpOrLeave}
      onWheel={onWheel}
      className="flex flex-row gap-2 overflow-x-auto no-scrollbar w-full py-2 cursor-grab active:cursor-grabbing select-none"
    >
      {images.map((img, idx) => (
        <div
          key={img + idx}
          className="relative shrink-0 w-44 h-44 rounded-2xl overflow-hidden border border-zinc-150 dark:border-zinc-900 shadow-sm transition-all"
        >
          <img
            src={img}
            alt={`Preview ${idx + 1}`}
            className="w-full h-full object-cover pointer-events-none"
          />
          <button
            type="button"
            onClick={() => onRemoveImage(idx)}
            className="absolute top-2 right-2 size-6 rounded-full bg-black/75 hover:bg-black text-white flex items-center justify-center border border-white/20 transition-all cursor-pointer"
          >
            <X className="size-3 shrink-0" />
          </button>
        </div>
      ))}
    </div>
  );
});

ImagePreviewList.displayName = "ImagePreviewList";

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
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [audience, setAudience] = useState<PostAudience>("anyone");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [location, setLocation] = useState<string | null>(null);

  // Separate Original Files Ref to prevent Textarea typing re-render payload lags
  const selectedFilesRef = useRef<File[]>([]);

  // Sub-Popover States
  const [isAudienceOpen, setIsAudienceOpen] = useState(false);
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);
  const [isGifOpen, setIsGifOpen] = useState(false);
  const [isLocationOpen, setIsLocationOpen] = useState(false);
  const [isDraftsOpen, setIsDraftsOpen] = useState(false);
  const [isWarningOpen, setIsWarningOpen] = useState(false);

  // Local query states for searching inside popups
  const [emojiQuery, setEmojiQuery] = useState("");
  const [gifQuery, setGifQuery] = useState("");
  const [locationQuery, setLocationQuery] = useState("");

  // Mentions State
  const [isMentionsOpen, setIsMentionsOpen] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [mentionIndex, setMentionIndex] = useState(-1);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Image Drag Scrolling Refs (to completely avoid state-based mouse move re-renders)
  const dragRef = useRef({
    isScrolling: false,
    startX: 0,
    scrollLeft: 0,
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
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

  // Track any open sub-popovers to notify escape shield
  const isAnySubPopoverOpen =
    isAudienceOpen ||
    isEmojiOpen ||
    isGifOpen ||
    isLocationOpen ||
    isDraftsOpen ||
    isMentionsOpen;

  useEffect(() => {
    onPopoverStateChange?.(isAnySubPopoverOpen);
  }, [isAnySubPopoverOpen, onPopoverStateChange]);

  useEffect(() => {
    onStateChange?.(isValid);
  }, [isValid, onStateChange]);

  // Unified ref to keep track of preview URLs to avoid lifecycle cleanup issues
  const previewUrlsRef = useRef<string[]>([]);
  useEffect(() => {
    previewUrlsRef.current = previewUrls;
  }, [previewUrls]);

  // Clean up Object URLs only on unmount
  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  // Imperative handle to trigger close and dialog safety checks
  useImperativeHandle(ref, () => ({
    triggerClose: () => {
      if (isValid) {
        setIsWarningOpen(true);
      } else {
        onCancel?.();
      }
    },
    handleInlineEscape: () => {
      if (isAnySubPopoverOpen) {
        return false;
      }
      if (document.activeElement === textareaRef.current) {
        if (isValid) {
          setIsWarningOpen(true);
          return true;
        } else {
          textareaRef.current?.blur();
          return true;
        }
      }
      return false;
    },
  }));

  // Reset popup search queries when popovers toggle
  useEffect(() => {
    if (!isEmojiOpen) setEmojiQuery("");
  }, [isEmojiOpen]);

  useEffect(() => {
    if (!isGifOpen) setGifQuery("");
  }, [isGifOpen]);

  useEffect(() => {
    if (!isLocationOpen) setLocationQuery("");
  }, [isLocationOpen]);

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

  const handleSelectMention = useCallback((username: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const value = textarea.value;
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
  }, [setValue, mentionIndex]);

  // Image Drag scrolling callbacks
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!scrollContainerRef.current) return;
    dragRef.current.isScrolling = true;
    dragRef.current.startX = e.pageX - scrollContainerRef.current.offsetLeft;
    dragRef.current.scrollLeft = scrollContainerRef.current.scrollLeft;
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current.isScrolling || !scrollContainerRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollContainerRef.current.offsetLeft;
    const walk = (x - dragRef.current.startX) * 1.5;
    scrollContainerRef.current.scrollLeft = dragRef.current.scrollLeft - walk;
  }, []);

  const handleMouseUpOrLeave = useCallback(() => {
    dragRef.current.isScrolling = false;
  }, []);

  // Smooth horizontal scroll wheel with requestAnimationFrame lerp logic
  const handleWheel = useCallback((e: React.WheelEvent) => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Handle when hold Shift key + scroll mouse wheel
    if (e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();

      // Calculate target scroll position (deltaY * sensitivity factor)
      const targetScroll = container.scrollLeft + e.deltaY * 1.6;

      // Create smooth scroll effect (Smooth Lerp)
      let start: number | null = null;
      const duration = 200; // Animation scroll duration (ms)
      const initialScroll = container.scrollLeft;

      const animateScroll = (timestamp: number) => {
        if (!start) start = timestamp;
        const elapsed = timestamp - start;
        const progress = Math.min(elapsed / duration, 1);

        // Ease-Out formula for smooth stop, no jank
        const easeOutQuad = (t: number) => t * (2 - t);

        container.scrollLeft = initialScroll + (targetScroll - initialScroll) * easeOutQuad(progress);

        if (progress < 1) {
          requestAnimationFrame(animateScroll);
        }
      };

      requestAnimationFrame(animateScroll);
    }
  }, []);

  // Premium file selection and RAM optimization
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const filesArray = Array.from(e.target.files);

    // Add files to binary ref
    selectedFilesRef.current = [...selectedFilesRef.current, ...filesArray];

    // Create local object URLs for immediate preview
    const newUrls = filesArray.map(file => URL.createObjectURL(file));
    setPreviewUrls(prev => [...prev, ...newUrls]);
    setImages(prev => [...prev, ...newUrls]);

    // Auto scroll horizontally to the end
    setTimeout(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollLeft = scrollContainerRef.current.scrollWidth;
      }
    }, 100);
  }, []);

  const handleRemoveImage = useCallback((index: number) => {
    setImages((prev) => {
      const targetUrl = prev[index];
      if (targetUrl && targetUrl.startsWith("blob:")) {
        URL.revokeObjectURL(targetUrl);
        setPreviewUrls(p => p.filter(url => url !== targetUrl));
      }
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const handleAddGif = useCallback((gifUrl: string) => {
    setImages((prev) => [...prev, gifUrl]);
    setIsGifOpen(false);
  }, []);

  const handleAddEmoji = useCallback((emoji: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const value = textarea.value;
    const caretPosition = textarea.selectionStart;
    const beforeText = value.substring(0, caretPosition);
    const afterText = value.substring(caretPosition);
    const newValue = beforeText + emoji + afterText;

    setValue("content", newValue);

    setTimeout(() => {
      textarea.focus();
      const newPos = caretPosition + emoji.length;
      textarea.setSelectionRange(newPos, newPos);
    }, 50);
  }, [setValue]);

  // Drafts Operations
  const handleSaveToDrafts = useCallback(() => {
    const content = textareaRef.current?.value || "";
    if (!content.trim() && images.length === 0) return;
    const savedId = saveDraft(content, images, audience, activeDraftId);
    setActiveDraftId(savedId);
    toast.success(t("creator.draftSaved") || "Draft saved successfully!");
    setIsDraftsOpen(false);
  }, [images, audience, activeDraftId, saveDraft, t]);

  const handleSaveToDraftsAndClose = useCallback(() => {
    const content = textareaRef.current?.value || "";
    saveDraft(content, images, audience, activeDraftId);

    // Revoke preview URLs
    previewUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    setPreviewUrls([]);
    selectedFilesRef.current = [];

    reset();
    setImages([]);
    setLocation(null);
    setIsWarningOpen(false);

    toast.success(t("creator.draftSaved") || "Draft saved successfully!");
    textareaRef.current?.blur();
    onCancel?.();
  }, [images, audience, activeDraftId, saveDraft, reset, onCancel, t]);

  const handleDiscardAndClose = useCallback(() => {
    if (activeDraftId) {
      deleteDraft(activeDraftId);
    }

    // Revoke preview URLs
    previewUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    setPreviewUrls([]);
    selectedFilesRef.current = [];

    reset();
    setImages([]);
    setLocation(null);
    setIsWarningOpen(false);

    textareaRef.current?.blur();
    onCancel?.();
  }, [activeDraftId, deleteDraft, reset, onCancel]);

  const handleRestoreDraft = useCallback((draft: any) => {
    setValue("content", draft.content);
    setImages(draft.images);
    setAudience(draft.audience);
    setActiveDraftId(draft.id);
    setIsDraftsOpen(false);
  }, [setValue]);

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

      // Revoke preview URLs
      previewUrls.forEach(url => URL.revokeObjectURL(url));
      setPreviewUrls([]);
      selectedFilesRef.current = [];

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

  // Local filtering lists
  const filteredEmojis = useMemo(() => {
    return MOCK_EMOJIS.filter(e =>
      e.char.includes(emojiQuery) ||
      e.category.toLowerCase().includes(emojiQuery.toLowerCase())
    );
  }, [emojiQuery]);

  const filteredGifs = useMemo(() => {
    return MOCK_GIFS.filter(g =>
      g.name.toLowerCase().includes(gifQuery.toLowerCase()) ||
      g.category.toLowerCase().includes(gifQuery.toLowerCase())
    );
  }, [gifQuery]);

  // Dynamic Location Reordering: selected location is sorted to index 0
  const filteredLocations = useMemo(() => {
    let result = MOCK_LOCATIONS.filter(loc =>
      loc.toLowerCase().includes(locationQuery.toLowerCase())
    );
    if (location) {
      result = [...result].sort((a, b) => {
        if (a === location) return -1;
        if (b === location) return 1;
        return 0;
      });
    }
    return result;
  }, [locationQuery, location]);

  // Memoized Popover Content Blocks to completely bypass cascade re-renders
  const emojiPickerContent = useMemo(() => {
    return (
      <PopoverContent
        side="bottom"
        align="start"
        avoidCollisions={true}
        collisionPadding={12}
        onWheel={(e) => e.stopPropagation()}
        className="w-80 sm:w-96 h-[420px] flex flex-col p-3 gap-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-900 shadow-2xl z-50 rounded-2xl"
      >
        <div className="text-[10px] font-bold uppercase text-zinc-400 px-2 py-1 mb-1 border-b border-zinc-100 dark:border-zinc-900/60 shrink-0">
          {t("creator.addMockEmoji") || "Select Emoji"}
        </div>

        <input
          type="text"
          value={emojiQuery}
          onChange={(e) => setEmojiQuery(e.target.value)}
          placeholder={t("creator.searchEmojiPlaceholder") || "Search emojis..."}
          className="w-full h-9 px-3 rounded-xl border border-zinc-200 dark:border-zinc-850 bg-transparent text-xs outline-none text-zinc-900 dark:text-zinc-100 focus:border-zinc-400 transition-colors shrink-0"
        />

        <ScrollArea className="flex-grow pr-1 flex flex-col min-h-0">
          <div className="flex flex-col gap-3">
            {["Smileys", "Hearts & Gestures", "Nature & Objects"].map((cat) => {
              const catEmojis = filteredEmojis.filter(e => e.category === cat);
              if (catEmojis.length === 0) return null;
              return (
                <div key={cat} className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">{cat}</span>
                  <div className="grid grid-cols-6 gap-1.5">
                    {catEmojis.map((emoji) => (
                      <button
                        key={emoji.char}
                        type="button"
                        onClick={() => handleAddEmoji(emoji.char)}
                        className="h-8 w-8 text-md rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 flex items-center justify-center cursor-pointer transition-colors"
                      >
                        {emoji.char}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {filteredEmojis.length === 0 && (
              <div className="text-center text-xs text-zinc-400 py-8">No matching emojis found</div>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    );
  }, [emojiQuery, filteredEmojis, handleAddEmoji, t]);

  const gifPickerContent = useMemo(() => {
    return (
      <PopoverContent
        side="bottom"
        align="start"
        avoidCollisions={true}
        collisionPadding={12}
        onWheel={(e) => e.stopPropagation()}
        className="w-80 sm:w-96 h-[420px] flex flex-col p-3 gap-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-900 shadow-2xl z-50 rounded-2xl"
      >
        <div className="text-[10px] font-bold uppercase text-zinc-400 px-2 py-1 mb-1 border-b border-zinc-100 dark:border-zinc-900/60 shrink-0">
          {t("creator.addMockGif") || "Select GIF"}
        </div>

        <input
          type="text"
          value={gifQuery}
          onChange={(e) => setGifQuery(e.target.value)}
          placeholder={t("creator.searchGifPlaceholder") || "Search GIFs..."}
          className="w-full h-9 px-3 rounded-xl border border-zinc-200 dark:border-zinc-850 bg-transparent text-xs outline-none text-zinc-900 dark:text-zinc-100 focus:border-zinc-400 transition-colors shrink-0"
        />

        <ScrollArea className="flex-grow pr-1 flex flex-col min-h-0">
          <div className="flex flex-col gap-3">
            {["Trending", "Reactions", "Memes"].map((cat) => {
              const catGifs = filteredGifs.filter(g => g.category === cat);
              if (catGifs.length === 0) return null;
              return (
                <div key={cat} className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">{cat}</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {catGifs.map((gif, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleAddGif(gif.url)}
                        className="rounded-xl overflow-hidden h-20 border border-zinc-100 dark:border-zinc-900 hover:border-zinc-400 dark:hover:border-zinc-650 cursor-pointer transition-all shrink-0"
                      >
                        <img src={gif.url} className="w-full h-full object-cover" alt={gif.name} />
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {filteredGifs.length === 0 && (
              <div className="text-center text-xs text-zinc-400 py-8">No matching GIFs found</div>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    );
  }, [gifQuery, filteredGifs, handleAddGif, t]);

  const locationPickerContent = useMemo(() => {
    return (
      <PopoverContent
        side="bottom"
        align="start"
        avoidCollisions={true}
        collisionPadding={12}
        onWheel={(e) => e.stopPropagation()}
        className="w-80 sm:w-96 h-[420px] flex flex-col p-3 gap-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-900 shadow-2xl z-50 rounded-2xl"
      >
        <div className="text-[10px] font-bold uppercase text-zinc-400 px-2 py-1 mb-1 border-b border-zinc-100 dark:border-zinc-900/60 shrink-0 flex items-center gap-1">
          <MapPinned className="size-3" />
          <span>{t("creator.location") || "Select location"}</span>
        </div>

        <input
          type="text"
          value={locationQuery}
          onChange={(e) => setLocationQuery(e.target.value)}
          placeholder={t("creator.searchLocationPlaceholder") || "Search locations..."}
          className="w-full h-9 px-3 rounded-xl border border-zinc-200 dark:border-zinc-850 bg-transparent text-xs outline-none text-zinc-900 dark:text-zinc-100 focus:border-zinc-400 transition-colors shrink-0"
        />

        <ScrollArea className="flex-grow pr-1 flex flex-col min-h-0">
          <div className="flex flex-col gap-1">
            {filteredLocations.map((loc) => {
              const isActive = location === loc;
              return (
                <button
                  key={loc}
                  type="button"
                  onClick={() => {
                    setLocation(loc);
                    setIsLocationOpen(false);
                  }}
                  className={`w-full h-12 shrink-0 px-2.5 rounded-xl flex justify-between items-center transition-colors cursor-pointer text-xs font-medium ${isActive
                    ? "bg-zinc-100 dark:bg-zinc-900 text-black dark:text-white font-bold"
                    : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                    }`}
                >
                  <div className="flex items-center min-w-0 mr-2">
                    <MapPin className="size-3.5 mr-2 text-zinc-400 shrink-0" />
                    <span className="truncate">{loc}</span>
                  </div>
                  {isActive && <Check className="size-3.5 text-zinc-950 dark:text-zinc-50 shrink-0 ml-2" />}
                </button>
              );
            })}
            {filteredLocations.length === 0 && (
              <div className="text-center text-xs text-zinc-400 py-8">No matching locations found</div>
            )}
          </div>
        </ScrollArea>

        {location && (
          <div className="border-t border-zinc-100 dark:border-zinc-900/60 pt-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setLocation(null);
                setIsLocationOpen(false);
              }}
              className="w-full h-9 rounded-xl font-bold text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors cursor-pointer"
            >
              Clear Location
            </button>
          </div>
        )}
      </PopoverContent>
    );
  }, [locationQuery, filteredLocations, location, t]);

  const audiencePickerContent = useMemo(() => {
    return (
      <PopoverContent
        side="bottom"
        align="start"
        avoidCollisions={true}
        collisionPadding={12}
        className="w-60 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md p-1.5 shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-200 z-50"
      >
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
          const isActive = audience === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                setAudience(opt.id as PostAudience);
                setIsAudienceOpen(false);
              }}
              className={`w-full flex justify-between items-center px-3 py-2 rounded-xl text-left text-xs cursor-pointer transition-colors ${isActive
                ? "bg-zinc-100 dark:bg-zinc-900 text-black dark:text-white font-bold"
                : "text-zinc-650 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <OptIcon className="size-3.5 shrink-0 text-zinc-400" />
                <span className="truncate">{opt.label}</span>
              </div>
              {isActive && <Check className="size-3.5 text-zinc-950 dark:text-zinc-50 shrink-0 ml-2" />}
            </button>
          );
        })}
      </PopoverContent>
    );
  }, [audience, t]);

  const draftsPickerContent = useMemo(() => {
    return (
      <PopoverContent
        side="bottom"
        align="start"
        avoidCollisions={true}
        collisionPadding={12}
        onWheel={(e) => e.stopPropagation()}
        className="w-72 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200 flex flex-col gap-2 z-50"
      >
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-900/60 pb-2 mb-1 shrink-0">
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

        <ScrollArea className="flex-grow pr-1 flex flex-col min-h-0 max-h-52">
          <div className="flex flex-col gap-2">
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
        </ScrollArea>
      </PopoverContent>
    );
  }, [drafts, isValid, handleSaveToDrafts, handleRestoreDraft, deleteDraft, t]);

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
              <span className="flex items-center text-zinc-400 dark:text-zinc-500 font-medium font-bold">
                <MapPin className="size-3 mr-0.5 text-zinc-500" />
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

          {/* Horizontal Images previews list extracted as React.memo sub-component */}
          <ImagePreviewList
            images={images}
            onRemoveImage={handleRemoveImage}
            scrollContainerRef={scrollContainerRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUpOrLeave={handleMouseUpOrLeave}
            onWheel={handleWheel}
          />

          {/* Tools Menu Bar */}
          <div className="flex items-center gap-1 border-t border-zinc-100 dark:border-zinc-900/60 pt-2.5">
            {/* Native image uploader input and trigger */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              className="h-8 w-8 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-transform active:scale-95 cursor-pointer"
              title={t("creator.attachment") || "Attach an image"}
            >
              <ImageIcon className="h-4 w-4 shrink-0" />
            </Button>

            {/* GIF Popover */}
            <div className="relative">
              <Popover open={isGifOpen} onOpenChange={setIsGifOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={`h-8 w-8 rounded-xl text-xs font-extrabold border-0 transition-all cursor-pointer ${isGifOpen
                      ? "bg-zinc-150 border-zinc-300 text-zinc-900 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-100"
                      : "border-zinc-205 dark:border-zinc-800/80 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-100"
                      }`}
                    title={t("creator.addMockGif") || "Add GIF"}
                  >
                    GIF
                  </Button>
                </PopoverTrigger>
                {gifPickerContent}
              </Popover>
            </div>

            {/* Emoji Popover */}
            <div className="relative">
              <Popover open={isEmojiOpen} onOpenChange={setIsEmojiOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-transform active:scale-95 cursor-pointer"
                    title={t("creator.addMockEmoji") || "Add Emoji"}
                  >
                    <Smile className="h-4 w-4 shrink-0" />
                  </Button>
                </PopoverTrigger>
                {emojiPickerContent}
              </Popover>
            </div>

            {/* Location Popover */}
            <div className="relative">
              <Popover open={isLocationOpen} onOpenChange={setIsLocationOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-transform active:scale-95 cursor-pointer"
                    title={t("creator.addMockLocation") || "Add Location"}
                  >
                    <MapPin className="h-4 w-4 shrink-0" />
                  </Button>
                </PopoverTrigger>
                {locationPickerContent}
              </Popover>
            </div>

            {/* Drafts Trigger */}
            <div className="relative">
              <Popover open={isDraftsOpen} onOpenChange={setIsDraftsOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-transform active:scale-95 cursor-pointer relative"
                    title={t("creator.drafts") || "Drafts"}
                  >
                    <FileText className="h-4 w-4 shrink-0" />
                    {drafts.length > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 size-2 bg-zinc-950 dark:bg-white rounded-full border border-white dark:border-black shrink-0" />
                    )}
                  </Button>
                </PopoverTrigger>
                {draftsPickerContent}
              </Popover>
            </div>
          </div>

          {/* Bottom Divider */}
          <div className="h-[1px] bg-zinc-100 dark:bg-zinc-900/60 my-1" />

          {/* Options & Action Footer */}
          <div className="flex items-center justify-between">
            {/* Post Option Audience Toggle */}
            <div className="relative">
              <Popover open={isAudienceOpen} onOpenChange={setIsAudienceOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
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
                </PopoverTrigger>
                {audiencePickerContent}
              </Popover>
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

        {/* Warning Discard Draft Overlay Alert Modal rendered as Portaled Dialog */}
        <DiscardWarningDialog
          open={isWarningOpen}
          onOpenChange={setIsWarningOpen}
          onSaveDraft={handleSaveToDraftsAndClose}
          onDiscard={handleDiscardAndClose}
          onKeepEditing={() => setIsWarningOpen(false)}
        />
      </div>
    </div>
  );
});

PostCreatorCore.displayName = "PostCreatorCore";
export default PostCreatorCore;

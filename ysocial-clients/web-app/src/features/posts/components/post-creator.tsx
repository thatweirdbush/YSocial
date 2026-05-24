"use client";

import React, { useRef, useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Image, Smile, Globe, Users, Lock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useTranslation } from "@/hooks/use-translation";
import { useAuthUser } from "@/features/auth/store/auth-store";

// Form validation schema following AGENTS.md conventions
const postSchema = z.object({
  content: z.string().min(1, "Content cannot be empty").max(500, "Content exceeds 500 characters limit"),
  imageUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
});

type PostFormValues = z.infer<typeof postSchema>;

interface PostCreatorProps {
  onSuccess?: (content: string, imageUrl?: string) => Promise<void>;
}

export function PostCreator({ onSuccess }: PostCreatorProps) {
  const { t } = useTranslation();
  const user = useAuthUser();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { isValid, errors },
  } = useForm<PostFormValues>({
    resolver: zodResolver(postSchema),
    defaultValues: {
      content: "",
      imageUrl: "",
    },
    mode: "onChange",
  });

  const contentValue = watch("content");
  const imageUrlValue = watch("imageUrl");

  // Hook-form ref merging to support auto-grow behavior on textarea
  const { ref: contentRef, ...contentRegister } = register("content");

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

  const handlePostSubmit = async (data: PostFormValues) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      if (onSuccess) {
        await onSuccess(data.content, data.imageUrl || undefined);
      }
      reset();
      setImagePreview(null);
    } catch (err) {
      console.error("Failed to create post", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddMockImage = () => {
    // Generate a beautiful mock random unsplash image to wow the user instead of generic placeholders
    const mockImage = `https://images.unsplash.com/photo-${1500000000000 + Math.floor(Math.random() * 1000000)}?auto=format&fit=crop&w=600&q=80`;
    setValue("imageUrl", mockImage, { shouldValidate: true });
    setImagePreview(mockImage);
  };

  const handleRemoveImage = () => {
    setValue("imageUrl", "", { shouldValidate: true });
    setImagePreview(null);
  };

  return (
    <form 
      onSubmit={handleSubmit(handlePostSubmit)}
      className="w-full border-b border-zinc-200/60 dark:border-zinc-900/60 p-4 bg-white dark:bg-black/40 flex gap-3 items-start transition-all"
    >
      <Avatar className="h-10 w-10 border border-zinc-150 dark:border-zinc-850 shrink-0">
        <AvatarImage src={user?.avatarUrl || "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=100&q=80"} />
        <AvatarFallback className="bg-zinc-200 dark:bg-zinc-800 text-xs font-semibold">Y</AvatarFallback>
      </Avatar>

      <div className="flex-grow flex flex-col gap-3 min-w-0">
        {/* Borderless expanding Textarea */}
        <textarea
          {...contentRegister}
          ref={(e) => {
            contentRef(e);
            textareaRef.current = e;
          }}
          placeholder={t("creator.placeholder")}
          className="w-full bg-transparent border-none outline-none resize-none text-black dark:text-zinc-100 placeholder-zinc-400 text-md min-h-[48px] py-1 max-h-[250px] leading-relaxed"
          maxLength={500}
        />

        {/* Media Preview Box */}
        {imagePreview && (
          <div className="relative rounded-2xl overflow-hidden border border-zinc-200/60 dark:border-zinc-800/60 max-h-[300px] w-full group animate-in fade-in zoom-in-95 duration-200">
            <img 
              src={imagePreview} 
              alt="Upload preview" 
              className="w-full h-full object-cover max-h-[300px]"
            />
            <Button
              type="button"
              variant="destructive"
              size="icon"
              onClick={handleRemoveImage}
              className="absolute top-3 right-3 h-8 w-8 rounded-full bg-black/60 hover:bg-black/90 text-white border border-white/20 backdrop-blur-sm transition-all"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Toolbars and Submit Trigger */}
        <div className="flex items-center justify-between border-t border-zinc-100 dark:border-zinc-900/60 pt-3">
          <div className="flex items-center gap-1">
            {/* Attachment Button */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleAddMockImage}
              className="h-9 w-9 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-500 hover:text-black dark:text-zinc-400 dark:hover:text-white transition-transform active:scale-95"
              title={t("creator.attachment")}
            >
              <Image className="h-5 w-5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-500 hover:text-black dark:text-zinc-400 dark:hover:text-white transition-transform active:scale-95 animate-pulse"
            >
              <Smile className="h-5 w-5" />
            </Button>
          </div>

          <div className="flex items-center gap-3">
            {/* Character counter */}
            {contentValue.length > 0 && (
              <span className={`text-xs ${contentValue.length > 450 ? "text-amber-500 font-bold" : "text-zinc-400"}`}>
                {contentValue.length}/500
              </span>
            )}

            {/* Post button with elegant active scale */}
            <Button
              type="submit"
              disabled={!isValid || isSubmitting}
              className="rounded-full px-5 py-1.5 h-9 font-semibold text-sm bg-zinc-950 dark:bg-zinc-50 text-white dark:text-black hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all duration-300 disabled:opacity-40 active:scale-95 shrink-0"
            >
              {isSubmitting ? t("creator.posting") : t("creator.post")}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
export default PostCreator;

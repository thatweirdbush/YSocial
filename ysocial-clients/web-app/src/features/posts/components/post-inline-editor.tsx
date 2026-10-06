"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/use-translation";
import { cn } from "@/lib/utils";
import { POST_CONTENT_MAX } from "../utils/post-content";

interface PostInlineEditorProps {
  initialContent: string;
  /** Posts with images may have empty text. */
  hasImages: boolean;
  /** An owner op is pending on the post. */
  disabled: boolean;
  /** Receives trimmed content; resolves true when saved. */
  onSave: (content: string) => Promise<boolean>;
  onCancel: () => void;
}

/** Text-only inline editor replacing a post's content (Esc cancels, Ctrl/Cmd+Enter saves). */
export function PostInlineEditor({ initialContent, hasImages, disabled, onSave, onCancel }: PostInlineEditorProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initialContent);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const trimmed = value.trim();
  const tooLong = value.length > POST_CONTENT_MAX;
  const canSave = !disabled && !tooLong && trimmed !== initialContent.trim() && (trimmed !== "" || hasImages);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, []);

  // Autosize: grow with content, no inner scrollbar
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [value]);

  const save = () => {
    if (canSave) void onSave(trimmed);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      save();
    }
  };

  return (
    <div className="flex flex-col gap-2" onClick={(event) => event.stopPropagation()}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        aria-label={t("card.editLabel")}
        rows={2}
        className="w-full resize-none overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2 text-sm leading-relaxed text-zinc-900 dark:text-zinc-100 outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/60"
      />
      <div className="flex items-center justify-end gap-2">
        <span className={cn("mr-auto text-xs tabular-nums", tooLong ? "text-red-500" : "text-zinc-400")}>
          {value.length}/{POST_CONTENT_MAX}
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} className="min-h-11 rounded-full px-4">
          {t("card.editCancel")}
        </Button>
        <Button type="button" size="sm" onClick={save} disabled={!canSave} className="min-h-11 rounded-full px-4">
          {t("card.editSave")}
        </Button>
      </div>
    </div>
  );
}

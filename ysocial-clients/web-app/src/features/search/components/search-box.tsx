"use client";

import { Hash, History, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { HighlightText } from "@/components/shared/highlight-text";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { HashtagStat } from "@/features/posts/types";
import type { UserProfile } from "@/features/profile/types";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useTranslation } from "@/hooks/use-translation";
import { tokenize } from "@/lib/text";
import { cn } from "@/lib/utils";
import { buildSearchHref, fetchSuggestions } from "../services/search-service";
import { useRecentSearches, useSearchActions } from "../store/search-store";
import type { SearchSuggestions } from "../types";

export const SUGGEST_DEBOUNCE_MS = 250;

interface SearchBoxProps {
  defaultValue?: string;
  autoFocus?: boolean;
  variant: "page" | "sidebar";
}

type SearchOption =
  | { kind: "recent"; query: string }
  | { kind: "query"; query: string }
  | { kind: "user"; user: UserProfile }
  | { kind: "tag"; stat: HashtagStat };

const EMPTY_SUGGESTIONS: SearchSuggestions = { users: [], tags: [] };

// Keeps focus in the input while clicking inside the popup (blur would close it first)
const keepFocus = (e: React.MouseEvent) => e.preventDefault();

/** Search input with a combobox popup: recent searches when empty, debounced user/tag suggestions while typing. */
export function SearchBox({ defaultValue = "", autoFocus, variant }: SearchBoxProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const baseId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef(0);

  const recent = useRecentSearches();
  const { addRecent, removeRecent, clearRecent } = useSearchActions();

  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [suggestions, setSuggestions] = useState<SearchSuggestions>(EMPTY_SUGGESTIONS);

  const debounced = useDebouncedValue(value, SUGGEST_DEBOUNCE_MS);
  const hasQuery = tokenize(value.replace(/^\s*[#@]/, "")).length > 0;

  useEffect(() => {
    const query = debounced.trim();
    if (tokenize(query.replace(/^[#@]/, "")).length === 0) return;

    // Only the latest request may write; slower earlier responses are dropped
    const requestId = ++requestRef.current;
    fetchSuggestions(query)
      .then((result) => {
        if (requestId === requestRef.current) setSuggestions(result);
      })
      .catch(() => {
        // Suggestions are best-effort; the query row still submits
      });
  }, [debounced]);

  const options = useMemo<SearchOption[]>(() => {
    if (!hasQuery) return recent.map((query) => ({ kind: "recent", query }));
    return [
      { kind: "query", query: value.trim() },
      ...suggestions.users.map((user): SearchOption => ({ kind: "user", user })),
      ...suggestions.tags.map((stat): SearchOption => ({ kind: "tag", stat })),
    ];
  }, [hasQuery, recent, suggestions, value]);

  const tokens = useMemo(() => tokenize(value), [value]);
  const listboxId = `${baseId}-listbox`;
  const optionId = (index: number) => `${baseId}-option-${index}`;
  const isOpen = open && options.length > 0;

  const close = () => {
    setOpen(false);
    setActiveIndex(-1);
  };

  const submit = (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    addRecent(trimmed);
    close();
    router.push(buildSearchHref(trimmed));
  };

  const select = (option: SearchOption) => {
    switch (option.kind) {
      case "recent":
      case "query":
        setValue(option.query);
        submit(option.query);
        return;
      case "user":
        close();
        router.push(`/@${option.user.username}`);
        return;
      case "tag":
        close();
        router.push(`/tags/${encodeURIComponent(option.stat.tag)}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setOpen(true);
        setActiveIndex((index) => Math.min(options.length - 1, index + 1));
        return;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((index) => Math.max(-1, index - 1));
        return;
      case "Enter":
        e.preventDefault();
        if (isOpen && activeIndex >= 0 && options[activeIndex]) select(options[activeIndex]);
        else submit(value);
        return;
      case "Escape":
        if (isOpen) {
          e.preventDefault();
          close();
        }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
    setOpen(true);
    setActiveIndex(-1);
  };

  const handleClear = () => {
    setValue("");
    setActiveIndex(-1);
    inputRef.current?.focus();
  };

  const renderOption = (option: SearchOption) => {
    switch (option.kind) {
      case "recent":
        return (
          <>
            <History className="size-4 shrink-0 text-zinc-400" aria-hidden="true" />
            <span className="flex-1 truncate">{option.query}</span>
            <button
              type="button"
              tabIndex={-1}
              aria-label={t("search.removeRecent", { query: option.query })}
              onClick={(e) => {
                e.stopPropagation();
                removeRecent(option.query);
              }}
              className="-mr-2 flex size-8 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-200/70 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </>
        );
      case "query":
        return (
          <>
            <Search className="size-4 shrink-0 text-zinc-400" aria-hidden="true" />
            <span className="flex-1 truncate">{t("search.searchFor", { query: option.query })}</span>
          </>
        );
      case "user":
        return (
          <>
            <Avatar className="size-8 shrink-0 border border-zinc-100 dark:border-zinc-900">
              <AvatarImage src={option.user.avatarUrl} alt="" />
              <AvatarFallback className="bg-zinc-200 text-xs font-semibold dark:bg-zinc-800">
                {option.user.displayName.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-semibold">
                <HighlightText text={option.user.displayName} tokens={tokens} />
              </span>
              <span className="truncate text-xs text-zinc-500">@{option.user.username}</span>
            </span>
          </>
        );
      case "tag":
        return (
          <>
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-900">
              <Hash className="size-4 text-zinc-500" aria-hidden="true" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-semibold">#{option.stat.tag}</span>
              <span className="truncate text-xs text-zinc-500">{t("tags.postsCount", { count: option.stat.postsCount })}</span>
            </span>
          </>
        );
    }
  };

  return (
    <div className="relative shrink-0" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && close()}>
      <div
        className={cn(
          "flex items-center gap-2 border border-zinc-200/60 bg-white/70 px-4 transition-all duration-300 focus-within:ring-1 focus-within:ring-zinc-400/30 motion-reduce:transition-none dark:border-zinc-800/60 dark:bg-zinc-950/40",
          variant === "page" ? "h-12 rounded-2xl" : "h-12 rounded-2xl border-zinc-200/40 dark:border-zinc-800/40",
        )}
      >
        <Search className="size-5 shrink-0 text-zinc-400" aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label={t("search.label")}
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={isOpen && activeIndex >= 0 ? optionId(activeIndex) : undefined}
          enterKeyHint="search"
          autoComplete="off"
          autoFocus={autoFocus}
          value={value}
          onChange={handleChange}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={t("search.placeholder")}
          className="w-full min-w-0 border-none bg-transparent text-sm text-black outline-none placeholder:text-zinc-400 dark:text-white"
        />
        {value && (
          <button
            type="button"
            onMouseDown={keepFocus}
            onClick={handleClear}
            aria-label={t("search.clear")}
            className="-mr-2 flex size-8 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {isOpen && (
        <div
          onMouseDown={keepFocus}
          className="absolute inset-x-0 top-full z-50 mt-2 max-h-[70vh] overflow-y-auto rounded-2xl border border-zinc-200/60 bg-white p-1.5 shadow-lg animate-in fade-in-0 zoom-in-95 duration-150 motion-reduce:animate-none dark:border-zinc-800/60 dark:bg-zinc-950"
        >
          {!hasQuery && (
            <div className="flex items-center justify-between px-3 pb-1 pt-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{t("search.recent")}</span>
              <button
                type="button"
                tabIndex={-1}
                onClick={clearRecent}
                className="rounded-full px-2 py-1 text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                {t("search.clearAll")}
              </button>
            </div>
          )}
          <ul id={listboxId} role="listbox" aria-label={t("search.label")}>
            {options.map((option, index) => (
              <li
                key={`${option.kind}-${index}`}
                id={optionId(index)}
                role="option"
                aria-selected={index === activeIndex}
                onClick={() => select(option)}
                onMouseEnter={() => setActiveIndex(index)}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100",
                  index === activeIndex && "bg-zinc-100 dark:bg-zinc-900",
                )}
              >
                {renderOption(option)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

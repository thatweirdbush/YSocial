"use client";

import { Hash, History, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { HighlightText } from "@/components/shared/highlight-text";
import { UserAvatar } from "@/components/shared/user-avatar";
import { useActorId } from "@/features/auth";
import type { HashtagStat } from "@/features/posts/types";
import type { UserProfile } from "@/features/profile/types";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useTranslation } from "@/hooks/use-translation";
import { normalizeText, tokenize } from "@/lib/text";
import { cn } from "@/lib/utils";
import { bareQuery, buildSearchHref, fetchSuggestions } from "../services/search-service";
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

/** Suggestions tagged with the normalized query they answer. */
interface SuggestionState extends SearchSuggestions {
  query: string;
}

const EMPTY_SUGGESTIONS: SuggestionState = { query: "", users: [], tags: [] };

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
  const [suggestions, setSuggestions] = useState<SuggestionState>(EMPTY_SUGGESTIONS);

  const actorId = useActorId();
  const debounced = useDebouncedValue(value, SUGGEST_DEBOUNCE_MS);
  const hasQuery = bareQuery(value) !== "";

  useEffect(() => {
    // Only the latest request may write; slower earlier responses are dropped (also when the input was cleared)
    const requestId = ++requestRef.current;
    const query = debounced.trim();
    if (!bareQuery(query)) return;

    fetchSuggestions(query, actorId)
      .then((result) => {
        if (requestId === requestRef.current) setSuggestions({ ...result, query: normalizeText(query) });
      })
      .catch(() => {
        // Suggestions are best-effort; the query row still submits
      });
  }, [debounced, actorId]);

  const options = useMemo<SearchOption[]>(() => {
    if (!hasQuery) return recent.map((query) => ({ kind: "recent", query }));
    // Suggestions for an older query stay only while the text still refines it ("an" -> "ann"), never for "zz"
    const current = normalizeText(value);
    const fresh = suggestions.query !== "" && current.startsWith(suggestions.query);
    return [
      { kind: "query", query: value.trim() },
      ...(fresh ? suggestions.users.map((user): SearchOption => ({ kind: "user", user })) : []),
      ...(fresh ? suggestions.tags.map((stat): SearchOption => ({ kind: "tag", stat })) : []),
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
    if (!bareQuery(trimmed)) return;
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
    // Vietnamese IMEs confirm the composition with Enter; never submit half-typed text
    if (e.nativeEvent.isComposing) return;
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
        return;
      case "Delete": {
        // Keyboard path for removing a recent search (the X button is mouse-only, see renderOption)
        const option = isOpen ? options[activeIndex] : undefined;
        if (option?.kind !== "recent") return;
        e.preventDefault();
        removeRecent(option.query);
        setActiveIndex((index) => Math.min(index, options.length - 2));
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
            {/* Mouse affordance only: interactive content inside role=option is invalid; keyboard uses Delete */}
            <button
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              title={t("search.removeRecent", { query: option.query })}
              aria-label={t("search.removeRecent", { query: option.query })}
              onClick={(e) => {
                e.stopPropagation();
                removeRecent(option.query);
              }}
              className="relative -mr-2 flex size-8 shrink-0 items-center justify-center rounded-full text-zinc-400 after:absolute after:-inset-1.5 after:content-[''] hover:bg-zinc-200/70 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
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
            <UserAvatar src={option.user.avatarUrl} name={option.user.displayName} className="size-8 shrink-0 border border-zinc-100 dark:border-zinc-900" />
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
              <span className="truncate text-xs text-zinc-500">{t(option.stat.postsCount === 1 ? "tags.postsCountOne" : "tags.postsCount", { count: option.stat.postsCount })}</span>
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
          aria-controls={isOpen ? listboxId : undefined}
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
            className="relative -mr-2 flex size-8 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors after:absolute after:-inset-1.5 after:content-[''] hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
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
                className="relative rounded-full px-2 py-1 text-xs font-semibold text-zinc-500 after:absolute after:-inset-x-1 after:-inset-y-2.5 after:content-[''] hover:text-zinc-900 dark:hover:text-zinc-100"
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

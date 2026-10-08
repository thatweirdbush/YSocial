"use client";

import { useRef } from "react";
import { useTranslation } from "@/hooks/use-translation";
import type { TranslationKey } from "@/lib/i18n/translate";
import type { ProfileTab } from "../types";

interface ProfileTabsProps {
  active: ProfileTab;
  onChange: (tab: ProfileTab) => void;
  /** Saved belongs to the signed-in owner only. */
  showSaved: boolean;
}

const TAB_LABELS: Record<ProfileTab, TranslationKey> = {
  threads: "profile.tabThreads",
  replies: "profile.tabReplies",
  media: "profile.tabMedia",
  saved: "profile.tabSaved",
};

/** Accessible tablist: roving tabindex, ArrowLeft/Right/Home/End select & focus. Panels use matching ids. */
export function ProfileTabs({ active, onChange, showSaved }: ProfileTabsProps) {
  const { t } = useTranslation();
  const buttons = useRef<Partial<Record<ProfileTab, HTMLButtonElement | null>>>({});

  const tabs: ProfileTab[] = showSaved ? ["threads", "replies", "media", "saved"] : ["threads", "replies", "media"];

  const select = (tab: ProfileTab) => {
    onChange(tab);
    buttons.current[tab]?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    const last = tabs.length - 1;
    const target: Record<string, number> = {
      ArrowRight: index === last ? 0 : index + 1,
      ArrowLeft: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    };
    if (event.key in target) {
      event.preventDefault();
      select(tabs[target[event.key]]);
    }
  };

  return (
    <div className="sticky top-0 z-20 shrink-0 border-b border-zinc-200/60 bg-white/80 backdrop-blur-md dark:border-zinc-900/60 dark:bg-black/80">
      <div role="tablist" className="flex w-full">
        {tabs.map((tab, index) => {
          const isActive = active === tab;
          return (
            <button
              key={tab}
              ref={(node) => {
                buttons.current[tab] = node;
              }}
              type="button"
              role="tab"
              id={`profile-tab-${tab}`}
              aria-selected={isActive}
              aria-controls={`profile-panel-${tab}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onChange(tab)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className="relative min-h-12 flex-1 cursor-pointer select-none py-3.5 text-center text-sm font-semibold tracking-tight text-zinc-400 outline-none transition-colors duration-200 hover:text-black focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-950 motion-reduce:transition-none dark:hover:text-white dark:focus-visible:ring-zinc-100"
            >
              <span className={isActive ? "text-black dark:text-white" : ""}>{t(TAB_LABELS[tab])}</span>
              {isActive && (
                <div className="absolute inset-x-0 bottom-0 h-0.5 bg-black duration-200 animate-in fade-in slide-in-from-bottom-1 motion-reduce:animate-none dark:bg-white" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

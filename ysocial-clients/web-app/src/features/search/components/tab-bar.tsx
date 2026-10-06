"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface TabBarProps<T extends string> {
  tabs: readonly { value: T; label: string }[];
  active: T;
  onChange: (value: T) => void;
  label: string;
  /** Id of the single tabpanel all tabs control; tab ids derive from it. */
  panelId: string;
}

export const tabId = (panelId: string, value: string) => `${panelId}-tab-${value}`;

/** Underlined tab strip matching the feed header tabs. ARIA tabs: roving tabindex, ←/→/Home/End select & focus. */
export function TabBar<T extends string>({ tabs, active, onChange, label, panelId }: TabBarProps<T>) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Move from the focused tab (falls back to the selected one) so repeated keys keep walking
    const focused = tabs.findIndex((tab) => tabId(panelId, tab.value) === document.activeElement?.id);
    const index = focused >= 0 ? focused : tabs.findIndex((tab) => tab.value === active);
    const last = tabs.length - 1;
    const next = { ArrowRight: index === last ? 0 : index + 1, ArrowLeft: index === 0 ? last : index - 1, Home: 0, End: last }[
      e.key as "ArrowRight" | "ArrowLeft" | "Home" | "End"
    ];
    if (next === undefined) return;

    e.preventDefault();
    onChange(tabs[next].value);
    document.getElementById(tabId(panelId, tabs[next].value))?.focus();
  };

  return (
    <div role="tablist" aria-label={label} onKeyDown={handleKeyDown} className="flex h-12 w-full">
      {tabs.map((tab) => {
        const selected = tab.value === active;
        return (
          <button
            key={tab.value}
            id={tabId(panelId, tab.value)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            onClick={() => !selected && onChange(tab.value)}
            className="relative flex flex-1 items-center justify-center text-sm font-bold transition-colors hover:bg-zinc-50 motion-reduce:transition-none dark:hover:bg-zinc-950"
          >
            <span className={cn(selected ? "text-black dark:text-white" : "text-zinc-400")}>{tab.label}</span>
            {selected && <span className="absolute bottom-0 h-[3px] w-12 rounded-full bg-black dark:bg-white" />}
          </button>
        );
      })}
    </div>
  );
}

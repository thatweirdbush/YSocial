"use client";

import { cn } from "@/lib/utils";

interface TabBarProps<T extends string> {
  tabs: readonly { value: T; label: string }[];
  active: T;
  onChange: (value: T) => void;
  label: string;
}

/** Underlined tab strip matching the feed header tabs. */
export function TabBar<T extends string>({ tabs, active, onChange, label }: TabBarProps<T>) {
  return (
    <div role="tablist" aria-label={label} className="flex h-12 w-full">
      {tabs.map((tab) => {
        const selected = tab.value === active;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={selected}
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

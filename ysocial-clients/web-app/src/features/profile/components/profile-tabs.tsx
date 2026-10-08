"use client";

import { useTranslation } from "@/hooks/use-translation";
import type { ProfileTab } from "../types";

interface ProfileTabsProps {
  activeTab: ProfileTab;
  onTabChange: (tab: ProfileTab) => void;
  showSavedTab: boolean;
}

export function ProfileTabs({ activeTab, onTabChange, showSavedTab }: ProfileTabsProps) {
  const { t } = useTranslation();

  const tabs: Array<{ id: ProfileTab; label: string }> = [
    { id: "threads", label: "Bài viết" },
    { id: "replies", label: "Trả lời" },
  ];

  if (showSavedTab) {
    tabs.push({ id: "saved", label: "Đã lưu" });
  }

  return (
    <div className="sticky top-0 bg-white/80 dark:bg-black/80 backdrop-blur-md border-b border-zinc-200/60 dark:border-zinc-900/60 z-20 shrink-0">
      <div className="flex w-full">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className="flex-1 text-center py-3.5 relative text-sm font-semibold tracking-tight transition-colors duration-250 select-none cursor-pointer text-zinc-400 hover:text-black dark:hover:text-white"
            >
              <span className={isActive ? "text-black dark:text-white" : ""}>
                {tab.label}
              </span>
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-black dark:bg-white animate-in fade-in slide-in-from-bottom-1 duration-200" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

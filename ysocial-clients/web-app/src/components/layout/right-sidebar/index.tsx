"use client";

import React from "react";
import { SearchWidget } from "./search-widget";
import { FollowSuggestions } from "./follow-suggestions";
import { TrendingWidget } from "./trending-widget";

export function RightSidebar() {
  return (
    <aside className="hidden lg:flex flex-col gap-6 py-6 px-2 w-[340px] ml-6 xl:ml-8 shrink-0 sticky top-0 h-screen overflow-y-auto bg-zinc-50 dark:bg-black">
      <SearchWidget />
      <FollowSuggestions />
      <TrendingWidget />

      {/* Minimalist footer */}
      <footer className="px-5 text-zinc-400 text-xs flex flex-wrap gap-x-3 gap-y-1.5 leading-5 shrink-0">
        <span className="hover:underline cursor-pointer">About</span>
        <span className="hover:underline cursor-pointer">Privacy Policy</span>
        <span className="hover:underline cursor-pointer">Terms</span>
        <span>© 2026 YSocial Inc.</span>
      </footer>
    </aside>
  );
}

export default RightSidebar;

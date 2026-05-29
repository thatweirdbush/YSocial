"use client";

import React, { useState } from "react";
import { Search } from "lucide-react";
import { useTranslation } from "@/hooks/use-translation";

export function SearchWidget() {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  return (
    <div className="flex items-center gap-2 bg-white/70 dark:bg-zinc-950/40 border border-zinc-200/40 dark:border-zinc-800/40 rounded-2xl py-3 px-4 focus-within:ring-1 focus-within:ring-zinc-400/30 transition-all duration-300 shrink-0">
      <Search className="h-5 w-5 text-zinc-400 shrink-0" />
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("nav.search")}
        className="bg-transparent border-none outline-none text-sm placeholder-zinc-400 w-full text-black dark:text-white"
      />
    </div>
  );
}

import React from "react";
import { Metadata } from "next";
import { SavedList } from "@/features/saved";

export const metadata: Metadata = {
  title: "Saved Items | YSocial",
  description: "Manage, search, and organize your saved articles, design posts, and developer collections on YSocial.",
  openGraph: {
    title: "Saved Items | YSocial",
    description: "Manage, search, and organize your saved articles, design posts, and developer collections on YSocial.",
    type: "website",
  },
};

export default function SavedPage() {
  return (
    <main className="w-full max-w-2xl mx-auto border-x border-zinc-100 dark:border-zinc-900 min-h-screen bg-white dark:bg-black/20">
      <SavedList />
    </main>
  );
}

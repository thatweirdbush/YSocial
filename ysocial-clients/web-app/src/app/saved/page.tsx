import React from "react";
import { Metadata } from "next";
import { MainLayout } from "@/components/layout/main-layout";
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
    <MainLayout>
      <SavedList />
    </MainLayout>
  );
}

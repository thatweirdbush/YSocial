import type { Metadata } from "next";
import { MainLayout } from "@/components/layout/main-layout";
import { FeatureUnavailable } from "@/components/shared/feature-unavailable";
import { hasCapability } from "@/lib/capabilities";
import { isSearchTab, resolveDefaultTab, SearchContainer } from "@/features/search";

interface PageProps {
  searchParams: Promise<{ q?: string | string[]; tab?: string | string[] }>;
}

const first = (value?: string | string[]) => (Array.isArray(value) ? value[0] : value) ?? "";

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const query = first((await searchParams).q).trim();

  if (!query) {
    return { title: "Khám phá • YSocial", description: "Khám phá người dùng, bài viết và hashtag đang thịnh hành trên YSocial." };
  }

  // Result pages are user-specific & infinite in number -> keep them out of the index
  return { title: `"${query}" - Tìm kiếm • YSocial`, robots: { index: false } };
}

export default async function SearchPage({ searchParams }: PageProps) {
  const params = await searchParams;
  if (!hasCapability("search")) {
    return (
      <MainLayout>
        <FeatureUnavailable />
      </MainLayout>
    );
  }
  const query = first(params.q).trim();
  const rawTab = first(params.tab);
  const tab = isSearchTab(rawTab) ? rawTab : resolveDefaultTab(query);

  return (
    <MainLayout>
      <SearchContainer key={query} query={query} tab={tab} />
    </MainLayout>
  );
}

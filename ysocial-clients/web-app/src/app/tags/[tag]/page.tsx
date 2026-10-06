import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MainLayout } from "@/components/layout/main-layout";
import { getMockTagStat } from "@/features/posts";
import { decodeTagParam, isTagSort, TagContainer } from "@/features/search";

interface PageProps {
  params: Promise<{ tag: string }>;
  searchParams: Promise<{ sort?: string | string[] }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const tag = decodeTagParam((await params).tag);
  if (!tag) return { title: "Không tìm thấy hashtag • YSocial" };

  const stat = getMockTagStat(tag);
  const title = `#${stat?.tag ?? tag} • YSocial`;
  const description = `${stat?.postsCount ?? 0} bài viết với #${stat?.tag ?? tag} trên YSocial.`;

  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
  };
}

export default async function TagPage({ params, searchParams }: PageProps) {
  const tag = decodeTagParam((await params).tag);
  if (!tag) notFound();

  const rawSort = (await searchParams).sort;
  const sortParam = Array.isArray(rawSort) ? rawSort[0] : rawSort;
  const sort = isTagSort(sortParam) ? sortParam : "top";

  return (
    <MainLayout>
      <TagContainer key={tag} tag={tag} sort={sort} />
    </MainLayout>
  );
}

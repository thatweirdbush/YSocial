import type { Metadata } from "next";
import { MainLayout } from "@/components/layout/main-layout";
import { getMockPostById, isPostPubliclyVisible, PostDetailContainer } from "@/features/posts";

interface PageProps {
  params: Promise<{ id: string }>;
}

const EXCERPT_LENGTH = 60;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const post = getMockPostById(id);

  // Close friends posts & private authors get the same generic metadata as an unknown post: no content in OG
  if (!post || !isPostPubliclyVisible(post)) {
    return { title: "Không tìm thấy bài viết • YSocial" };
  }

  const excerpt = post.content.length > EXCERPT_LENGTH ? `${post.content.slice(0, EXCERPT_LENGTH)}…` : post.content;
  const title = `${post.user.displayName} trên YSocial: "${excerpt}"`;

  return {
    title,
    description: post.content,
    openGraph: {
      title,
      description: post.content,
      type: "article",
      images: post.imageUrl ? [post.imageUrl] : post.imageUrls?.slice(0, 1),
    },
  };
}

export default async function PostDetailPage({ params }: PageProps) {
  const { id } = await params;

  return (
    <MainLayout>
      <PostDetailContainer key={id} postId={id} />
    </MainLayout>
  );
}

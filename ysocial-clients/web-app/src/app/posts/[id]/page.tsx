import type { Metadata } from "next";
import { MainLayout } from "@/components/layout/main-layout";
import { getMockPostById, isPostPubliclyVisible, PostDetailContainer, toPostThread } from "@/features/posts";
import type { PostItem, ThreadDto } from "@/features/posts";
import { isRealApi } from "@/lib/api-config";
import { isBackendId } from "@/lib/backend-id";
import { isNotFound, serverApiFetch } from "@/lib/server-api";

interface PageProps {
  params: Promise<{ id: string }>;
}

const EXCERPT_LENGTH = 60;

const NOT_FOUND_METADATA: Metadata = { title: "Không tìm thấy bài viết • YSocial" };

function postMetadata(post: PostItem): Metadata {
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

/**
 * Real BE: metadata ONLY, read anonymously (tokens live in localStorage). A private author's post is 404 here but
 * 200 for an accepted follower, so the server never decides the page: 404 -> generic title (the page still
 * renders & the client resolves it with the viewer's token); network/5xx throw to `error.tsx`.
 * `threads/{id}` accepts post & comment ids (`posts/{id}` 404s for comments).
 */
async function realMetadata(id: string): Promise<Metadata> {
  if (!isBackendId(id)) return NOT_FOUND_METADATA;
  try {
    return postMetadata(toPostThread(await serverApiFetch<ThreadDto>(`/api/threads/${id}`)).post);
  } catch (error) {
    if (isNotFound(error)) return NOT_FOUND_METADATA;
    throw error;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  if (isRealApi("content")) return realMetadata(id);
  const post = getMockPostById(id);

  // Close friends posts & private authors get the same generic metadata as an unknown post: no content in OG
  if (!post || !isPostPubliclyVisible(post)) {
    return NOT_FOUND_METADATA;
  }

  return postMetadata(post);
}

export default async function PostDetailPage({ params }: PageProps) {
  const { id } = await params;

  return (
    <MainLayout>
      <PostDetailContainer key={id} postId={id} />
    </MainLayout>
  );
}

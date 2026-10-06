import { MainLayout } from "@/components/layout/main-layout";
import { PostDetailShell, PostDetailSkeleton } from "@/features/posts";

export default function PostDetailLoading() {
  return (
    <MainLayout>
      <PostDetailShell>
        <PostDetailSkeleton />
      </PostDetailShell>
    </MainLayout>
  );
}

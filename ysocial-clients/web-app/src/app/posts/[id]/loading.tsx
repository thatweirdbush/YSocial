import { MainLayout } from "@/components/layout/main-layout";
import { PostDetailSkeleton } from "@/features/posts";

export default function PostDetailLoading() {
  return (
    <MainLayout>
      <PostDetailSkeleton />
    </MainLayout>
  );
}

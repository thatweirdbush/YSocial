import { MainLayout } from "@/components/layout/main-layout";
import { PostFeed } from "@/features/posts";

export default function Home() {
  return (
    <MainLayout>
      <PostFeed />
    </MainLayout>
  );
}

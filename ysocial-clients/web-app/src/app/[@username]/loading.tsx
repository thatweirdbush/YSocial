import { MainLayout } from "@/components/layout/main-layout";
import { ProfileSkeleton } from "@/features/profile";

export default function ProfileLoading() {
  return (
    <MainLayout>
      <ProfileSkeleton />
    </MainLayout>
  );
}

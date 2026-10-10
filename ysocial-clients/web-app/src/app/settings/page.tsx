import type { Metadata } from "next";
import { MainLayout } from "@/components/layout/main-layout";
import { SettingsIndex } from "@/features/settings";

export const metadata: Metadata = {
  title: "Cài đặt • YSocial",
  description: "Quản lý quyền riêng tư, danh sách chặn, ẩn và bạn thân trên YSocial.",
};

// Keeps the default right sidebar: the section menu lives in the center column here, so it is never shown twice
export default function SettingsPage() {
  return (
    <MainLayout>
      <SettingsIndex />
    </MainLayout>
  );
}

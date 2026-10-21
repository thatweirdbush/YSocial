import type { Metadata } from "next";
import { ContentSection } from "@/features/settings";

export const metadata: Metadata = {
  title: "Nội dung • YSocial",
  description: "Quản lý tài khoản đã ẩn và cách YSocial hiển thị số lượt thích, chia sẻ trên thiết bị này.",
};

export default function ContentSettingsPage() {
  return <ContentSection />;
}

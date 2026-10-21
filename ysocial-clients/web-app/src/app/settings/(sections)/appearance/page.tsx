import type { Metadata } from "next";
import { AppearanceSection } from "@/features/settings";

export const metadata: Metadata = {
  title: "Giao diện • YSocial",
  description: "Chọn chủ đề, cỡ chữ và mức chuyển động của giao diện YSocial trên thiết bị này.",
};

export default function AppearanceSettingsPage() {
  return <AppearanceSection />;
}

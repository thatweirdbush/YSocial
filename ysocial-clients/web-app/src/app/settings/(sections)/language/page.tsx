import type { Metadata } from "next";
import { LanguageSection } from "@/features/settings";

export const metadata: Metadata = {
  title: "Ngôn ngữ • YSocial",
  description: "Chọn ngôn ngữ hiển thị của YSocial trên thiết bị này.",
};

export default function LanguageSettingsPage() {
  return <LanguageSection />;
}

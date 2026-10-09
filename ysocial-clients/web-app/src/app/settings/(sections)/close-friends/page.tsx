import type { Metadata } from "next";
import { CloseFriendsSection } from "@/features/settings";

export const metadata: Metadata = {
  title: "Bạn thân • YSocial",
  description: "Chọn những người có thể xem bài viết chỉ dành cho bạn thân trên YSocial.",
};

export default function CloseFriendsSettingsPage() {
  return <CloseFriendsSection />;
}

import type { Metadata } from "next";
import { NotificationsSection } from "@/features/settings";

export const metadata: Metadata = {
  title: "Thông báo • YSocial",
  description: "Chọn loại thông báo bạn muốn nhận trên YSocial: lượt thích, trả lời và theo dõi.",
};

export default function NotificationSettingsPage() {
  return <NotificationsSection />;
}

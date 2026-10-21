import type { Metadata } from "next";
import { TimeManagementSection } from "@/features/settings";

export const metadata: Metadata = {
  title: "Quản lý thời gian • YSocial",
  description: "Xem thời gian bạn dùng YSocial hôm nay và trung bình 7 ngày, chỉ lưu trên thiết bị này.",
};

export default function TimeManagementSettingsPage() {
  return <TimeManagementSection />;
}

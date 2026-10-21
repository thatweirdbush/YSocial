import type { Metadata } from "next";
import { AccountSection } from "@/features/settings";

export const metadata: Metadata = {
  title: "Tài khoản • YSocial",
  description: "Xem email, tên người dùng và cập nhật giới tính, ngày sinh của tài khoản YSocial.",
};

export default function AccountSettingsPage() {
  return <AccountSection />;
}

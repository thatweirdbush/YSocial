import type { Metadata } from "next";
import { SessionsSection } from "@/features/settings";

export const metadata: Metadata = {
  title: "Phiên đăng nhập • YSocial",
  description: "Xem các thiết bị đang đăng nhập tài khoản YSocial và đăng xuất từ xa.",
};

export default function SessionsSettingsPage() {
  return <SessionsSection />;
}

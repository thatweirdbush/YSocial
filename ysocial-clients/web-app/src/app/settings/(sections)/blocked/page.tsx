import type { Metadata } from "next";
import { BlockedSection } from "@/features/settings";

export const metadata: Metadata = {
  title: "Tài khoản đã chặn • YSocial",
  description: "Xem và bỏ chặn các tài khoản bạn đã chặn trên YSocial.",
};

export default function BlockedSettingsPage() {
  return <BlockedSection />;
}

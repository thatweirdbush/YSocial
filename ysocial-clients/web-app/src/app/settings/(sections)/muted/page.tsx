import type { Metadata } from "next";
import { MutedSection } from "@/features/settings";

export const metadata: Metadata = {
  title: "Tài khoản đã ẩn • YSocial",
  description: "Xem và bỏ ẩn các tài khoản bạn đã ẩn khỏi bảng tin trên YSocial.",
};

export default function MutedSettingsPage() {
  return <MutedSection />;
}

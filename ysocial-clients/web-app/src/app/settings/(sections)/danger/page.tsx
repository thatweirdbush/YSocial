import type { Metadata } from "next";
import { DangerSection } from "@/features/settings";

export const metadata: Metadata = {
  title: "Vùng nguy hiểm • YSocial",
  description: "Xoá vĩnh viễn tài khoản YSocial của bạn.",
};

export default function DangerSettingsPage() {
  return <DangerSection />;
}

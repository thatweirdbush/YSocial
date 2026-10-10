import type { Metadata } from "next";
import { PrivacySection } from "@/features/settings";

export const metadata: Metadata = {
  title: "Quyền riêng tư • YSocial",
  description: "Bật tài khoản riêng tư và duyệt các yêu cầu theo dõi trên YSocial.",
};

export default function PrivacySettingsPage() {
  return <PrivacySection />;
}

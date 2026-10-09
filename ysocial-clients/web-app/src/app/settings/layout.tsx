import type { Metadata } from "next";
import { SettingsGuestGate } from "@/features/settings";

// Every settings route is private: never indexed, and gated for guests (the app shell comes from each page)
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <SettingsGuestGate>{children}</SettingsGuestGate>;
}

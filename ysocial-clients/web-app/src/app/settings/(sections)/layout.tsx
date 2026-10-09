import { MainLayout } from "@/components/layout/main-layout";
import { SettingsNav } from "@/features/settings";

// Section pages swap the right sidebar for the section menu (lg and up); below lg each page shows a Back header
export default function SettingsSectionsLayout({ children }: { children: React.ReactNode }) {
  return <MainLayout aside={<SettingsNav />}>{children}</MainLayout>;
}

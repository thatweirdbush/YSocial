import { MainLayout } from "@/components/layout/main-layout";
import { NotificationContainer } from "@/features/notifications";

export const metadata = {
  title: "Thông báo • YSocial",
  description: "Xem các tương tác thích, theo dõi, và bình luận phản hồi trên YSocial.",
  openGraph: {
    title: "Thông báo • YSocial",
    description: "Xem các tương tác thích, theo dõi, và bình luận phản hồi trên YSocial.",
    type: "website",
  },
};

export default function NotificationsPage() {
  return (
    <MainLayout>
      <NotificationContainer />
    </MainLayout>
  );
}

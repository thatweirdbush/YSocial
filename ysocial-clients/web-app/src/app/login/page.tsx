import { LoginForm, AuthLayoutShell } from "@/features/auth";

export const metadata = {
  title: "Đăng nhập • YSocial",
  description: "Đăng nhập vào hệ sinh thái mạng xã hội YSocial để bắt đầu chia sẻ ý tưởng.",
  openGraph: {
    title: "Đăng nhập • YSocial",
    description: "Đăng nhập vào hệ sinh thái mạng xã hội YSocial để bắt đầu chia sẻ ý tưởng.",
    type: "website",
  },
};

export default function LoginPage() {
  return (
    <AuthLayoutShell>
      <LoginForm />
    </AuthLayoutShell>
  );
}

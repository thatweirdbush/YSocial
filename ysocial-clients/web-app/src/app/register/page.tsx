import { RegisterForm, AuthLayoutShell } from "@/features/auth";

export const metadata = {
  title: "Đăng ký • YSocial",
  description: "Tạo tài khoản mới trên mạng xã hội YSocial để bắt đầu trải nghiệm kết nối.",
  openGraph: {
    title: "Đăng ký • YSocial",
    description: "Tạo tài khoản mới trên mạng xã hội YSocial để bắt đầu trải nghiệm kết nối.",
    type: "website",
  },
};

export default function RegisterPage() {
  return (
    <AuthLayoutShell>
      <RegisterForm />
    </AuthLayoutShell>
  );
}

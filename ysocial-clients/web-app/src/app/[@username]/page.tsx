import { MainLayout } from "@/components/layout/main-layout";
import { ProfileContainer } from "@/features/profile";

interface PageProps {
  params: Promise<{
    "@username": string;
  }>;
}

/** `/@Name`, `/%40name` -> `name` (malformed encodings keep the raw segment instead of throwing). */
function normalizeUsername(raw: string): string {
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // keep the raw segment
  }
  return decoded.replace(/^@/, "").toLowerCase();
}

export async function generateMetadata({ params }: PageProps) {
  const username = normalizeUsername((await params)["@username"]);

  return {
    title: `${username} (@${username}) \u2022 YSocial`,
    description: `Xem b\u00e0i vi\u1ebft, c\u00e2u tr\u1ea3 l\u1eddi v\u00e0 n\u1ed9i dung \u0111\u00e3 l\u01b0u c\u1ee7a @${username} tr\u00ean YSocial.`,
    openGraph: { type: "profile" },
  };
}

export default async function ProfilePage({ params }: PageProps) {
  const username = normalizeUsername((await params)["@username"]);

  return (
    <MainLayout>
      <ProfileContainer key={username} username={username} />
    </MainLayout>
  );
}

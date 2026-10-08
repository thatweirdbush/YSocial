import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { MainLayout } from "@/components/layout/main-layout";
import { MOCK_SESSION_COOKIE, parseMockSession } from "@/features/auth";
import { normalizeUsername, ProfileContainer, resolveProfileRoute } from "@/features/profile";
import { translate } from "@/lib/i18n/translate";
import { DEFAULT_LOCALE } from "@/lib/store/ui-store";

interface PageProps {
  params: Promise<{
    "@username": string;
  }>;
}

/**
 * The only Next request boundary of the profile route: the mock session cookie + the pure resolver decide
 * between render and a real 404. Reading cookies makes this route request-time rendered (spec D8).
 */
async function resolveRequest({ params }: PageProps) {
  const username = normalizeUsername((await params)["@username"]);
  const session = parseMockSession((await cookies()).get(MOCK_SESSION_COOKIE)?.value);
  return { username, resolution: resolveProfileRoute(username, session) };
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const { username, resolution } = await resolveRequest(props);

  // Server cannot know the client locale (it lives in ui-store): metadata always uses DEFAULT_LOCALE (spec D20)
  if (!resolution) return { title: translate(DEFAULT_LOCALE, "profile.notFoundMeta") };

  const defaultDescription = translate(DEFAULT_LOCALE, "profile.metaDescription", { username });
  if (resolution.kind === "session") {
    const title = translate(DEFAULT_LOCALE, "profile.metaTitleRuntime", { username });
    return { title, description: defaultDescription, openGraph: { title, description: defaultDescription, type: "profile" } };
  }

  const { user } = resolution;
  const title = translate(DEFAULT_LOCALE, "profile.metaTitle", { name: user.displayName, username: user.username });
  const description = user.bio ?? defaultDescription;
  return {
    title,
    description,
    openGraph: { title, description, type: "profile", images: user.avatarUrl ? [user.avatarUrl] : undefined },
  };
}

export default async function ProfilePage(props: PageProps) {
  const { username, resolution } = await resolveRequest(props);
  if (!resolution) notFound();

  return (
    <MainLayout>
      <ProfileContainer key={username} username={username} />
    </MainLayout>
  );
}

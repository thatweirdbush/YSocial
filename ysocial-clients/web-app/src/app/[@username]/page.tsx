import type { Metadata } from "next";
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { MainLayout } from "@/components/layout/main-layout";
import { MOCK_SESSION_COOKIE, parseMockSession, USERNAME_PATTERN } from "@/features/auth";
import { normalizeUsername, ProfileContainer, resolveProfileRoute, toUserProfile } from "@/features/profile";
import type { UserProfileDto } from "@/features/profile";
import { isRealApi } from "@/lib/api-config";
import { isNotFound, serverApiFetch } from "@/lib/server-api";
import { translate } from "@/lib/i18n/translate";
import { DEFAULT_LOCALE } from "@/lib/store/ui-store";

interface PageProps {
  params: Promise<{
    "@username": string;
  }>;
}

/**
 * Real BE read (anonymous: tokens live in localStorage). Unknown/deleted profile = 404 for every viewer (private
 * = 200, D15), so only a BE 404 becomes `notFound()`; network, TLS & 5xx failures throw to `error.tsx`.
 * Cached per request: `generateMetadata` & the page share one call.
 */
const getRealProfile = cache(async (username: string) => {
  // Cannot exist (BE answers 400 over 30 chars): same outcome as unknown, no request
  if (!USERNAME_PATTERN.test(username)) return null;
  try {
    return toUserProfile(await serverApiFetch<UserProfileDto>(`/api/users/by-username/${encodeURIComponent(username)}`));
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
});

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
  if (isRealApi("content")) return realMetadata(props);
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

async function realMetadata({ params }: PageProps): Promise<Metadata> {
  const username = normalizeUsername((await params)["@username"]);
  const user = await getRealProfile(username);
  if (!user) return { title: translate(DEFAULT_LOCALE, "profile.notFoundMeta") };

  const title = translate(DEFAULT_LOCALE, "profile.metaTitle", { name: user.displayName, username: user.username });
  const description = user.bio ?? translate(DEFAULT_LOCALE, "profile.metaDescription", { username });
  return {
    title,
    description,
    openGraph: { title, description, type: "profile", images: user.avatarUrl ? [user.avatarUrl] : undefined },
  };
}

export default async function ProfilePage(props: PageProps) {
  if (isRealApi("content")) {
    const username = normalizeUsername((await props.params)["@username"]);
    if (!(await getRealProfile(username))) notFound();
    return (
      <MainLayout>
        <ProfileContainer key={username} username={username} />
      </MainLayout>
    );
  }
  const { username, resolution } = await resolveRequest(props);
  if (!resolution) notFound();

  return (
    <MainLayout>
      <ProfileContainer key={username} username={username} />
    </MainLayout>
  );
}

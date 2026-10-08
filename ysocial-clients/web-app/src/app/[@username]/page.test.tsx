import { beforeEach, describe, expect, it, vi } from "vitest";

import { MOCK_SESSION_COOKIE, serializeMockSession } from "@/features/auth";

const cookieStore = vi.hoisted(() => ({ value: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "ysocial_mock_user" && cookieStore.value !== undefined ? { name, value: cookieStore.value } : undefined),
  }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/components/layout/main-layout", () => ({ MainLayout: ({ children }: { children: unknown }) => children }));

import ProfilePage, { generateMetadata } from "./page";

const params = (username: string) => ({ params: Promise.resolve({ "@username": username }) });
const sessionCookie = (id: string, username: string) => serializeMockSession({ id, username });

beforeEach(() => {
  cookieStore.value = undefined;
  expect(MOCK_SESSION_COOKIE).toBe("ysocial_mock_user");
});

describe("ProfilePage", () => {
  it("renders for the current session's runtime user", async () => {
    cookieStore.value = sessionCookie("2", "a.user");
    await expect(ProfilePage(params("a.user"))).resolves.toBeDefined();
  });

  it("is a real 404 for another session's runtime user", async () => {
    cookieStore.value = sessionCookie("2", "a.user");
    await expect(ProfilePage(params("b.user"))).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("is a 404 with a malformed cookie and an unknown username", async () => {
    cookieStore.value = "%E0%A4%A";
    await expect(ProfilePage(params("nope"))).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("is a 404 for a malformed username segment", async () => {
    cookieStore.value = sessionCookie("2", "a.user");
    await expect(ProfilePage(params("%E0%A4%A"))).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("renders seed users without any session", async () => {
    await expect(ProfilePage(params("%40AnQuoc.Dev"))).resolves.toBeDefined();
  });
});

describe("generateMetadata", () => {
  it("describes a seed user with name, bio and avatar", async () => {
    const metadata = await generateMetadata(params("anquoc.dev"));

    expect(metadata.title).toBe("Trần Anh Quốc (@anquoc.dev) • YSocial");
    expect(metadata.description).toContain("DDD");
    expect(metadata.openGraph).toMatchObject({ type: "profile" });
    expect(metadata.openGraph?.images).toHaveLength(1);
  });

  it("has no image for a runtime user (the server has no profile data)", async () => {
    cookieStore.value = sessionCookie("2", "a.user");
    const metadata = await generateMetadata(params("a.user"));

    expect(metadata.title).toBe("@a.user • YSocial");
    expect(metadata.openGraph?.images).toBeUndefined();
  });

  it("uses the not-found title for an unknown user", async () => {
    const metadata = await generateMetadata(params("nope"));
    expect(metadata.title).toBe("Không tìm thấy người dùng • YSocial");
  });

  it("does not throw on a malformed username", async () => {
    const metadata = await generateMetadata(params("%E0%A4%A"));
    expect(metadata.title).toBe("Không tìm thấy người dùng • YSocial");
  });
});

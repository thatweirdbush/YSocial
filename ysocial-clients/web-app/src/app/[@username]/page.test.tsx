import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MOCK_SESSION_COOKIE, serializeMockSession } from "@/features/auth";
import { mockFetchSequence, problem, setRealSlices, type MockStep } from "@/test/api-test-utils";

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

describe("ProfilePage (real BE)", () => {
  const dto = (overrides: Record<string, unknown> = {}) => ({
    id: "0b8f1c52-6a3e-4c53-9b42-5f9d6f7a1e10",
    username: "real_user",
    displayName: "Real User",
    bio: "Real bio",
    avatarUrl: null,
    followersCount: 1,
    followingCount: 2,
    isPrivate: false,
    isVerified: false,
    followStatus: "none",
    ...overrides,
  });
  const useFetch = (steps: MockStep[]) => {
    const fake = mockFetchSequence(steps);
    vi.stubGlobal("fetch", fake.fetchFn);
    return fake.calls;
  };

  beforeEach(() => setRealSlices("auth,content"));
  afterEach(() => vi.unstubAllGlobals());

  it("unknown username -> notFound", async () => {
    useFetch([problem(404, "NotFound")]);
    await expect(ProfilePage(params("ghost"))).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("BE down -> throws (not notFound)", async () => {
    useFetch([{ status: 0, reject: new TypeError("fetch failed") }]);
    const error = await ProfilePage(params("real_user")).catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: "network" });
  });

  it("TLS failure / 5xx -> throws", async () => {
    useFetch([problem(500, "InternalError")]);
    await expect(ProfilePage(params("real_user"))).rejects.toMatchObject({ status: 500 });
  });

  it("renders a real profile & never consults the mock session", async () => {
    const calls = useFetch([{ status: 200, body: dto() }]);
    await expect(ProfilePage(params("%40Real_User"))).resolves.toBeDefined();
    expect(calls[0].url).toContain("/api/users/by-username/real_user");
  });

  it("username that cannot exist -> notFound without fetch", async () => {
    const calls = useFetch([]);
    await expect(ProfilePage(params("x".repeat(40)))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(calls).toHaveLength(0);
  });

  it("private profile is 200 metadata", async () => {
    useFetch([{ status: 200, body: dto({ isPrivate: true, bio: null }) }]);
    const metadata = await generateMetadata(params("real_user"));
    expect(metadata.title).toContain("Real User");
    expect(metadata.title).toContain("@real_user");
  });

  it("metadata of an unknown profile is the generic not-found title, BE down throws", async () => {
    useFetch([problem(404, "NotFound"), { status: 0, reject: new TypeError("fetch failed") }]);
    expect(String((await generateMetadata(params("ghost"))).title)).toContain("Không tìm thấy");
    await expect(generateMetadata(params("real_user"))).rejects.toMatchObject({ kind: "network" });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockFetchSequence, problem, setRealSlices, type MockStep } from "@/test/api-test-utils";
import PostDetailPage, { generateMetadata } from "./page";

vi.mock("@/components/layout/main-layout", () => ({ MainLayout: () => null }));

const metadataOf = (id: string) => generateMetadata({ params: Promise.resolve({ id }) });

describe("post detail metadata", () => {
  it("describes a public post by a public author", async () => {
    const metadata = await metadataOf("post-001");

    expect(String(metadata.title)).toContain("Antigravity Architect");
    expect(metadata.description).toContain("Chào mừng");
  });

  it.each([
    ["a close friends post", "post-cf-01"],
    ["a post by a private author", "post-007"],
    ["a reply by a private author", "reply-001-04"],
    ["a post by the private demo account", "post-demo-01"],
    ["an unknown post", "khong-ton-tai"],
  ])("returns generic metadata without content for %s", async (_label, id) => {
    const metadata = await metadataOf(id);

    expect(metadata).toEqual({ title: "Không tìm thấy bài viết • YSocial" });
  });
});

describe("post detail metadata (real BE)", () => {
  const ID = "11111111-1111-4111-8111-111111111111";
  const thread = (overrides: Record<string, unknown> = {}) => ({
    post: {
      id: ID,
      kind: "post",
      postId: ID,
      content: "Nội dung thật",
      createdAt: "2026-10-19T00:00:00Z",
      imageUrl: "https://x/y.png",
      user: { id: "22222222-2222-4222-8222-222222222222", username: "real", displayName: "Real User" },
      ...overrides,
    },
    parent: null,
    replies: [],
    childReplies: {},
  });
  const useFetch = (steps: MockStep[]) => {
    const fake = mockFetchSequence(steps);
    vi.stubGlobal("fetch", fake.fetchFn);
    return fake.calls;
  };

  beforeEach(() => setRealSlices("auth,content"));
  afterEach(() => vi.unstubAllGlobals());

  it("200 thread -> post metadata, read anonymously from /api/threads", async () => {
    const calls = useFetch([{ status: 200, body: thread() }]);
    const metadata = await metadataOf(ID);
    expect(calls[0].url).toContain(`/api/threads/${ID}`);
    expect(new Headers(calls[0].init?.headers).get("Authorization")).toBeNull();
    expect(String(metadata.title)).toContain("Real User");
    expect(metadata.description).toBe("Nội dung thật");
    expect(metadata.openGraph).toMatchObject({ images: ["https://x/y.png"] });
  });

  it("comment id resolves through threads for metadata", async () => {
    useFetch([{ status: 200, body: thread({ id: ID, kind: "comment", postId: "33333333-3333-4333-8333-333333333333" }) }]);
    expect(String((await metadataOf(ID)).title)).toContain("Real User");
  });

  it("anonymous 404 -> generic title (the page still renders for an accepted follower)", async () => {
    useFetch([problem(404, "NotFound")]);
    expect(await metadataOf(ID)).toEqual({ title: "Không tìm thấy bài viết • YSocial" });
  });

  it("mock id never reaches the network", async () => {
    const calls = useFetch([]);
    expect(await metadataOf("post-001")).toEqual({ title: "Không tìm thấy bài viết • YSocial" });
    expect(calls).toHaveLength(0);
  });

  it("BE down / 5xx -> throws (error page), never a not-found title", async () => {
    useFetch([{ status: 0, reject: new TypeError("fetch failed") }, problem(500, "InternalError")]);
    await expect(metadataOf(ID)).rejects.toMatchObject({ kind: "network" });
    await expect(metadataOf(ID)).rejects.toMatchObject({ status: 500 });
  });

  it("the page body never calls notFound on the server", async () => {
    const calls = useFetch([]);
    await expect(PostDetailPage({ params: Promise.resolve({ id: ID }) })).resolves.toBeDefined();
    expect(calls).toHaveLength(0);
  });
});

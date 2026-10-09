import { describe, expect, it, vi } from "vitest";
import { generateMetadata } from "./page";

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

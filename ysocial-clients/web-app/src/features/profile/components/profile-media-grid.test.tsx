import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { resetPostStore, usePostStore } from "@/features/posts/store/post-store";
import type { PostItem } from "@/features/posts/types";
import { ProfileMediaGrid } from "./profile-media-grid";

const makePost = (id: string, overrides: Partial<PostItem> = {}): PostItem => ({
  id,
  kind: "post",
  rootPostId: id,
  content: `content ${id}`,
  createdAt: "2026-10-01T00:00:00.000Z",
  likesCount: 0,
  commentsCount: 0,
  isLikedByCurrentUser: false,
  isBookmarkedByCurrentUser: false,
  user: { id: "u1", displayName: "User", username: "demo" },
  ...overrides,
});

beforeEach(() => {
  resetPostStore();
  usePostStore.getState().actions.upsertPosts([
    makePost("single", { imageUrl: "https://img.test/single.jpg" }),
    makePost("multi", { imageUrls: ["https://img.test/a.jpg", "https://img.test/b.jpg", "https://img.test/c.jpg"] }),
    makePost("text-only"),
  ]);
});

describe("ProfileMediaGrid", () => {
  it("renders a tile only for posts that carry images", () => {
    render(<ProfileMediaGrid ids={["single", "multi", "text-only"]} username="demo" />);

    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("links every tile to the post detail page", () => {
    render(<ProfileMediaGrid ids={["single", "multi"]} username="demo" />);

    const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual(["/posts/single", "/posts/multi"]);
  });

  it("marks multi-image posts with a labelled badge and uses the first image", () => {
    render(<ProfileMediaGrid ids={["single", "multi"]} username="demo" />);

    const [single, multi] = screen.getAllByRole("link");
    expect(within(single).queryByLabelText("Bài viết có nhiều ảnh")).toBeNull();
    expect(within(multi).getByLabelText("Bài viết có nhiều ảnh")).toBeInTheDocument();
    expect(within(multi).getByRole("img", { name: /Ảnh trong bài viết của @demo/ })).toHaveAttribute("src", "https://img.test/a.jpg");
  });

  it("gives every image a meaningful alt text", () => {
    const { container } = render(<ProfileMediaGrid ids={["single", "multi"]} username="demo" />);

    const images = Array.from(container.querySelectorAll("img"));
    expect(images).toHaveLength(2);
    for (const image of images) expect(image.getAttribute("alt")?.trim()).toBeTruthy();
  });
});

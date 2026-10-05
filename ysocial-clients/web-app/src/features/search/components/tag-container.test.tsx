import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMockPostById } from "@/features/posts";
import * as postService from "@/features/posts/services/post-service";
import { resetPostStore, usePostStore } from "@/features/posts/store/post-store";
import { resetSearchStore, tagPageKey, useSearchStore } from "../store/search-store";
import { TagContainer } from "./tag-container";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace, back: vi.fn() }),
}));

const LOAD_TIMEOUT = { timeout: 3000 };

const waitForPage = () => waitFor(() => expect(screen.queryByTestId("search-skeleton")).toBeNull(), LOAD_TIMEOUT);

beforeEach(() => {
  vi.restoreAllMocks();
  postService.__resetMockDb();
  resetPostStore();
  resetSearchStore();
  replace.mockClear();
});

describe("TagContainer", () => {
  it("shows the tag header with count and newest posts first", async () => {
    const spy = vi.spyOn(postService, "fetchPostsByTag");
    render(<TagContainer tag="dalat" sort="latest" />);
    await waitForPage();

    expect(spy).toHaveBeenCalledWith("dalat", "latest");
    expect(screen.getByRole("heading", { name: "#ĐàLạt" })).toBeInTheDocument();
    expect(screen.getByText("2 bài viết")).toBeInTheDocument();
    const articles = screen.getAllByRole("article");
    expect(articles).toHaveLength(2);
    expect(articles[0]).toHaveTextContent("Bình minh ở Đà Lạt");
  });

  it("switches sort via router.replace", async () => {
    render(<TagContainer tag="dalat" sort="latest" />);
    await waitForPage();

    await userEvent.click(screen.getByRole("tab", { name: "Hàng đầu" }));

    expect(replace).toHaveBeenCalledWith("/tags/dalat?sort=top", { scroll: false });
    await waitForPage();
  });

  it("shows an empty state for a tag without posts", async () => {
    render(<TagContainer tag="nope" sort="top" />);
    await waitForPage();

    expect(screen.getByText("#nope chưa có bài nào")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tìm kiếm khác" })).toHaveAttribute("href", "/search");
  });

  it("renders a cached page without calling the service", () => {
    const spy = vi.spyOn(postService, "fetchPostsByTag");
    const post = getMockPostById("post-006")!;
    usePostStore.getState().actions.upsertPosts([post]);
    useSearchStore.getState().actions.setTagPage(tagPageKey("dalat", "top"), { tag: "ĐàLạt", postsCount: 1, postIds: [post.id] });

    render(<TagContainer tag="dalat" sort="top" />);

    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(spy).not.toHaveBeenCalled();
  });
});

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MOCK_AUTHORS, MOCK_FOLLOWED_AUTHOR_IDS } from "../mocks/mock-authors";
import * as service from "../services/post-service";
import { resetPostStore, usePostStore } from "../store/post-store";
import { PostCreatorDialog } from "./post-creator-dialog";
import { PostFeed } from "./post-feed";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

const LOAD_TIMEOUT = { timeout: 3000 };

beforeEach(() => {
  resetPostStore();
  service.__resetMockDb();
  vi.restoreAllMocks();
});

describe("PostFeed", () => {
  it("shows skeletons first, then the first page of posts", async () => {
    const { container } = render(<PostFeed />);

    expect(container.querySelector(".animate-pulse")).not.toBeNull();
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(service.FEED_PAGE_SIZE), LOAD_TIMEOUT);
  });

  it("limits the following tab to followed authors", async () => {
    render(<PostFeed />);
    await waitFor(() => expect(screen.getAllByRole("article").length).toBeGreaterThan(0), LOAD_TIMEOUT);

    await userEvent.click(screen.getByRole("button", { name: "Đang theo dõi" }));

    const followedNames = MOCK_AUTHORS.filter((a) => MOCK_FOLLOWED_AUTHOR_IDS.includes(a.id)).map((a) => a.displayName);
    await waitFor(() => {
      const articles = screen.getAllByRole("article");
      expect(articles.length).toBeLessThan(service.FEED_PAGE_SIZE);
      for (const article of articles) {
        expect(followedNames.some((name) => within(article).queryByText(name))).toBe(true);
      }
    }, LOAD_TIMEOUT);
  });

  it("reuses the cached feed on remount without a skeleton or refetch", async () => {
    const spy = vi.spyOn(service, "fetchFeed");
    const first = render(<PostFeed />);
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(service.FEED_PAGE_SIZE), LOAD_TIMEOUT);
    first.unmount();

    const { container } = render(<PostFeed />);

    expect(container.querySelector(".animate-pulse")).toBeNull();
    expect(screen.getAllByRole("article")).toHaveLength(service.FEED_PAGE_SIZE);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("shows the empty state when there are no posts", async () => {
    vi.spyOn(service, "fetchFeed").mockResolvedValue({ posts: [] });

    render(<PostFeed />);

    expect(await screen.findByText("Chưa có bài viết nào ở đây.", {}, LOAD_TIMEOUT)).toBeInTheDocument();
  });
});

describe("PostCreatorDialog default submit", () => {
  it("prepends the created post to the forYou feed", async () => {
    render(<PostCreatorDialog open onOpenChange={vi.fn()} />);

    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByRole("textbox"), "bài mới");
    await userEvent.click(within(dialog).getByRole("button", { name: "Đăng" }));

    await waitFor(() => {
      const { feedIds, posts } = usePostStore.getState();
      expect(posts[feedIds.forYou[0]]?.content).toBe("bài mới");
    }, LOAD_TIMEOUT);
  });
});

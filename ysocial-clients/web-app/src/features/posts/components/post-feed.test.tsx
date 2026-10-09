import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GUEST_ACTOR_ID, useAuthStore } from "@/features/auth/store/auth-store";
import * as userService from "@/features/profile/services/user-service";
import { getFollowedIds, resetUserStore } from "@/features/profile/store/user-store";
import { SEED_AUTHORS, SEED_FOLLOWED_AUTHOR_IDS } from "@/mocks/seed-authors";
import * as service from "../services/post-service";
import { resetPostStore, usePostStore } from "../store/post-store";
import { PostCreatorDialog } from "./post-creator-dialog";
import { PostFeed } from "./post-feed";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
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

    await userEvent.click(within(screen.getByRole("banner")).getByRole("button", { name: "Đang theo dõi" }));

    const followedNames = SEED_AUTHORS.filter((a) => SEED_FOLLOWED_AUTHOR_IDS.includes(a.id)).map((a) => a.displayName);
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

/** Sentinel always on screen: fires on every observe(), like a short feed whose bottom is visible. */
class AlwaysVisibleObserver {
  private active = true;
  constructor(private readonly callback: IntersectionObserverCallback) {}
  observe(target: Element) {
    setTimeout(() => {
      if (this.active) this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
    }, 0);
  }
  unobserve() {}
  disconnect() {
    this.active = false;
  }
  takeRecords() {
    return [];
  }
}

describe("PostFeed paging & refresh", () => {
  const originalObserver = globalThis.IntersectionObserver;
  afterEach(() => {
    globalThis.IntersectionObserver = originalObserver;
  });

  it("labels the header button as refresh", async () => {
    render(<PostFeed />);

    expect(screen.getByRole("button", { name: "Làm mới" })).toBeInTheDocument();
    // Let the first page settle: an in-flight fetch would write into the next test's (global) store.
    await screen.findAllByRole("article", {}, LOAD_TIMEOUT);
  });

  it("retries a failed follow-graph load on the next page-1 load", async () => {
    resetUserStore();
    vi.spyOn(userService, "fetchFollowedIds").mockRejectedValueOnce(new Error("offline"));
    const feedSpy = vi.spyOn(service, "fetchFeed");
    render(<PostFeed />);
    await screen.findAllByRole("article", {}, LOAD_TIMEOUT);

    await userEvent.click(screen.getByRole("button", { name: "Làm mới" }));

    await waitFor(() => expect(getFollowedIds(GUEST_ACTOR_ID).loaded).toBe(true), LOAD_TIMEOUT);
    // Let the refresh settle: an in-flight fetch would write into the next test's (global) store
    await act(() => feedSpy.mock.results[1].value);
  });

  it("stops auto-loading after a next-page failure and offers a retry", async () => {
    globalThis.IntersectionObserver = AlwaysVisibleObserver as unknown as typeof IntersectionObserver;
    const realFetch = service.fetchFeed;
    let failNextPage = true;
    // A guest sees only 10 seed roots (one real page): split them across 2 fake pages (5 + 5)
    const half = async (tab: Parameters<typeof realFetch>[0], actorId: string, second: boolean) => {
      const result = await realFetch(tab, 1, actorId);
      return second ? { posts: result.posts.slice(5) } : { posts: result.posts.slice(0, 5), nextPage: 2 };
    };
    const spy = vi.spyOn(service, "fetchFeed").mockImplementation((tab, page, actorId) =>
      page > 1 && failNextPage ? Promise.reject(new Error("offline")) : half(tab, actorId, page > 1),
    );
    const toastError = vi.spyOn(toast, "error");
    const nextPageCalls = () => spy.mock.calls.filter(([, page]) => page === 2).length;
    render(<PostFeed />);

    const retry = await screen.findByRole("button", { name: "Thử lại" }, LOAD_TIMEOUT);
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(nextPageCalls()).toBe(1);
    expect(toastError).toHaveBeenCalledTimes(1);

    failNextPage = false;
    await userEvent.click(retry);

    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(10), LOAD_TIMEOUT);
    expect(nextPageCalls()).toBe(2);
  });
});

describe("PostFeed viewer switch", () => {
  afterEach(() => {
    useAuthStore.setState({ user: null });
  });

  it("reloads page 1 for the new viewer after the viewer feeds were reset", async () => {
    const spy = vi.spyOn(service, "fetchFeed");
    render(<PostFeed />);
    await screen.findAllByRole("article", {}, LOAD_TIMEOUT);
    expect(spy).toHaveBeenCalledWith("forYou", 1, GUEST_ACTOR_ID);

    act(() => {
      useAuthStore.setState({ user: { id: "1", email: "member@ysocial.dev" } });
      usePostStore.getState().actions.resetViewerFeeds();
    });

    await waitFor(() => expect(spy).toHaveBeenCalledWith("forYou", 1, "1"), LOAD_TIMEOUT);
    await waitFor(() => expect(usePostStore.getState().feedMeta.forYou.loaded).toBe(true), LOAD_TIMEOUT);
    expect(screen.getAllByRole("article").length).toBeGreaterThan(0);
  });

  it("ignores a page that finished after the viewer changed", async () => {
    const realFetch = service.fetchFeed;
    let releaseGuest!: () => void;
    const guestGate = new Promise<void>((resolve) => (releaseGuest = resolve));
    vi.spyOn(service, "fetchFeed").mockImplementation(async (tab, page, actorId) => {
      const result = await realFetch(tab, page, actorId);
      if (actorId === GUEST_ACTOR_ID) await guestGate;
      return result;
    });
    render(<PostFeed />);

    act(() => {
      useAuthStore.setState({ user: { id: "1", email: "member@ysocial.dev" } });
      usePostStore.getState().actions.resetViewerFeeds();
    });
    await waitFor(() => expect(usePostStore.getState().feedMeta.forYou.loaded).toBe(true), LOAD_TIMEOUT);
    const ownIds = usePostStore.getState().feedIds.forYou;

    releaseGuest();
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));

    expect(usePostStore.getState().feedIds.forYou).toEqual(ownIds);
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

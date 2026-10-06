import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { __resetMockDb, createPost } from "@/features/posts/services/post-service";
import { resetPostStore, usePostStore } from "@/features/posts/store/post-store";
import { __resetMockUsers } from "@/features/profile/services/user-service";
import { resetUserStore } from "@/features/profile/store/user-store";
import { getMockPostById } from "@/features/posts";
import * as service from "../services/search-service";
import { resetSearchStore, useSearchStore } from "../store/search-store";
import { SearchContainer } from "./search-container";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push, replace, back: vi.fn() }),
}));

const LOAD_TIMEOUT = { timeout: 3000 };

const waitForResults = () => waitFor(() => expect(screen.queryByTestId("search-skeleton")).toBeNull(), LOAD_TIMEOUT);

beforeEach(() => {
  vi.restoreAllMocks();
  __resetMockDb();
  __resetMockUsers();
  resetPostStore();
  resetUserStore();
  resetSearchStore();
  push.mockClear();
  replace.mockClear();
});

describe("SearchContainer", () => {
  it("shows the explore landing for an empty query", async () => {
    render(<SearchContainer query="" tab="top" />);

    expect(screen.getByRole("heading", { name: "Khám phá" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /#Minimalism/ }, LOAD_TIMEOUT)).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /Antigravity Architect/ }, LOAD_TIMEOUT)).toBeInTheDocument();
  });

  it("renders top results with highlighted posts", async () => {
    const { container } = render(<SearchContainer query="next" tab="top" />);

    expect(screen.getByTestId("search-skeleton")).toBeInTheDocument();
    await waitForResults();

    const usersSection = screen.getByRole("heading", { name: "Người dùng" }).closest("section")!;
    expect(within(usersSection).getByRole("link", { name: /Elena Vance/ })).toBeInTheDocument();
    expect(screen.getAllByRole("article").length).toBeGreaterThan(0);
    expect(container.querySelector("article mark")).not.toBeNull();
  });

  it("switches tab via router.replace", async () => {
    render(<SearchContainer query="next" tab="top" />);
    await waitForResults();

    await userEvent.click(screen.getByRole("tab", { name: "Người dùng" }));

    expect(replace).toHaveBeenCalledWith("/search?q=next&tab=users", { scroll: false });
    expect(screen.getByRole("tab", { name: "Người dùng" })).toHaveAttribute("aria-selected", "true");
  });

  it("shows the tab empty state", async () => {
    render(<SearchContainer query="zzzz" tab="users" />);
    await waitForResults();

    expect(screen.getByText("Chưa thấy ai khớp, thử tên khác xem")).toBeInTheDocument();
  });

  it("retries after a failure", async () => {
    vi.spyOn(service, "fetchSearch").mockRejectedValueOnce(new Error("boom"));
    render(<SearchContainer query="next" tab="posts" />);

    expect(await screen.findByText("Tìm kiếm bị lỗi rồi", undefined, LOAD_TIMEOUT)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    await waitForResults();

    expect(screen.getAllByRole("article").length).toBeGreaterThan(0);
  });

  it("renders the cached result at once and revalidates silently", async () => {
    const spy = vi.spyOn(service, "fetchSearch");
    const post = getMockPostById("post-004")!;
    usePostStore.getState().actions.upsertPosts([post]);
    useSearchStore.getState().actions.setResult({
      query: "Zinc",
      userIds: [],
      postIds: [post.id],
      latestPostIds: [post.id],
      tags: [],
    });
    await createPost({ content: "Zinc mới tinh", images: [], audience: "anyone" }, post.user);

    render(<SearchContainer query="zinc" tab="top" />);

    expect(screen.queryByTestId("search-skeleton")).toBeNull();
    expect(screen.getAllByRole("article")).toHaveLength(1);
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(2), LOAD_TIMEOUT);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("search-skeleton")).toBeNull();
  });

  it("keeps the cached result when revalidation fails", async () => {
    const spy = vi.spyOn(service, "fetchSearch").mockRejectedValueOnce(new Error("boom"));
    const post = getMockPostById("post-004")!;
    usePostStore.getState().actions.upsertPosts([post]);
    useSearchStore.getState().actions.setResult({ query: "zinc", userIds: [], postIds: [post.id], latestPostIds: [post.id], tags: [] });

    render(<SearchContainer query="zinc" tab="top" />);
    await waitFor(() => expect(spy).toHaveBeenCalled());

    expect(screen.queryByText("Tìm kiếm bị lỗi rồi")).toBeNull();
    expect(screen.getAllByRole("article")).toHaveLength(1);
  });

  it("renders the Posts tab in service order without re-sorting", async () => {
    const [older, newer] = [getMockPostById("post-009")!, getMockPostById("post-002")!];
    vi.spyOn(service, "fetchSearch").mockResolvedValueOnce({ users: [], posts: [newer, older], latestPosts: [older, newer], tags: [] });
    render(<SearchContainer query="next" tab="posts" />);
    await waitForResults();

    const articles = screen.getAllByRole("article");
    expect(articles[0]).toHaveTextContent("Skeleton phải khớp");
    expect(articles[1]).toHaveTextContent("Next.js App Router");
  });

  it("shows no results, not the landing, for a bare #", () => {
    const spy = vi.spyOn(service, "fetchSearch");
    render(<SearchContainer query="#" tab="tags" />);

    expect(screen.getByText('Không có kết quả cho "#"')).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Khám phá" })).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("follows the tab prop when the URL changes without a remount", async () => {
    const { rerender } = render(<SearchContainer query="next" tab="users" />);
    await waitForResults();

    rerender(<SearchContainer query="next" tab="top" />);

    expect(screen.getByRole("tab", { name: "Hàng đầu" })).toHaveAttribute("aria-selected", "true");
  });

  it("links the selected tab to its panel", async () => {
    render(<SearchContainer query="next" tab="top" />);
    await waitForResults();

    const tab = screen.getByRole("tab", { name: "Hàng đầu" });
    const panel = screen.getByRole("tabpanel");
    expect(tab).toHaveAttribute("aria-controls", panel.id);
    expect(panel).toHaveAttribute("aria-labelledby", tab.id);
  });

  it("adds the query to recent searches", async () => {
    render(<SearchContainer query="next" tab="top" />);
    await waitForResults();

    expect(useSearchStore.getState().recent[0]).toBe("next");
  });
});

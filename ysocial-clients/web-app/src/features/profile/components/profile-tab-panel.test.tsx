import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as postService from "@/features/posts/services/post-service";
import { resetPostStore, usePostStore } from "@/features/posts/store/post-store";
import type { ParentReference, PostItem, UserPostsPage } from "@/features/posts/types";
import { resetUserStore } from "../store/user-store";
import { ProfileTabPostsProvider, useProfileTabPostsController } from "../hooks/use-profile-tab-posts";
import type { ProfileTab } from "../types";
import { ProfileTabPanel } from "./profile-tab-panel";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

const makePost = (id: string, overrides: Partial<PostItem> = {}): PostItem => ({
  id,
  content: `content ${id}`,
  createdAt: "2026-10-01T00:00:00.000Z",
  likesCount: 0,
  commentsCount: 0,
  isLikedByCurrentUser: false,
  isBookmarkedByCurrentUser: false,
  user: { id: "u1", displayName: "User", username: "demo" },
  ...overrides,
});

const page = (posts: PostItem[], nextPage?: number, parents: ParentReference[] = []): UserPostsPage => ({ posts, parents, nextPage, locked: false });

interface HarnessProps {
  tab: ProfileTab;
  isOwn?: boolean;
  onCreatePost?: () => void;
}

function Harness({ tab, isOwn = false, onCreatePost = () => undefined }: HarnessProps) {
  const controller = useProfileTabPostsController("u1", "v1");
  return (
    <ProfileTabPostsProvider value={controller}>
      <ProfileTabPanel tab={tab} userId="u1" username="demo" isOwn={isOwn} onCreatePost={onCreatePost} />
    </ProfileTabPostsProvider>
  );
}

const articleTexts = () => screen.getAllByRole("article").map((article) => article.textContent ?? "");
const indexOfContent = (texts: string[], id: string) => texts.findIndex((text) => text.includes(`content ${id}`));

type ObserverCallback = (entries: Array<{ isIntersecting: boolean }>) => void;

const observers: ObserverCallback[] = [];
const intersectAll = () => observers.forEach((callback) => callback([{ isIntersecting: true }]));

beforeEach(() => {
  vi.restoreAllMocks();
  resetPostStore();
  resetUserStore();
  observers.length = 0;
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: ObserverCallback) {
        observers.push(callback);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ProfileTabPanel locked", () => {
  it("shows the private state instead of an empty panel when the service reports the profile as locked", async () => {
    vi.spyOn(postService, "fetchUserPosts").mockResolvedValue({ ...page([]), locked: true });
    render(<Harness tab="threads" />);

    expect(await screen.findByRole("heading", { name: "Tài khoản này là riêng tư" })).toBeInTheDocument();
    expect(screen.queryAllByRole("article")).toHaveLength(0);
  });
});

describe("ProfileTabPanel threads", () => {
  it("renders the pinned post first and reorders live when another post is pinned", async () => {
    vi.spyOn(postService, "fetchUserPosts").mockResolvedValue(
      page([makePost("a"), makePost("b", { isPinned: true }), makePost("c")]),
    );
    render(<Harness tab="threads" />);

    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(3));
    let texts = articleTexts();
    expect(indexOfContent(texts, "b")).toBe(0);

    act(() => {
      usePostStore.getState().actions.setPinned("c", true);
    });

    texts = articleTexts();
    expect(indexOfContent(texts, "c")).toBe(0);
  });

  it("does not render tombstoned posts", async () => {
    vi.spyOn(postService, "fetchUserPosts").mockResolvedValue(page([makePost("a"), makePost("b")]));
    render(<Harness tab="threads" />);
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(2));

    act(() => {
      usePostStore.getState().actions.removePost("b");
    });

    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.queryByText("content b")).toBeNull();
  });

  it("shows the own empty state and its CTA opens the composer callback", async () => {
    vi.spyOn(postService, "fetchUserPosts").mockResolvedValue(page([]));
    const onCreatePost = vi.fn();
    render(<Harness tab="threads" isOwn onCreatePost={onCreatePost} />);

    expect(await screen.findByText("Bạn chưa đăng thread nào")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Đăng thread đầu tiên" }));

    expect(onCreatePost).toHaveBeenCalledTimes(1);
  });

  it("shows the visitor empty state without a CTA", async () => {
    vi.spyOn(postService, "fetchUserPosts").mockResolvedValue(page([]));
    render(<Harness tab="threads" />);

    expect(await screen.findByText("@demo chưa đăng thread nào")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Đăng thread đầu tiên" })).toBeNull();
  });

  it("loads the next page when the sentinel intersects", async () => {
    const spy = vi
      .spyOn(postService, "fetchUserPosts")
      .mockImplementation(async (_user, _tab, pageNumber) => (pageNumber === 1 ? page([makePost("a")], 2) : page([makePost("b")])));
    render(<Harness tab="threads" />);
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(1));
    await waitFor(() => expect(observers.length).toBeGreaterThan(0));

    act(() => intersectAll());

    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(2));
    expect(spy).toHaveBeenCalledWith("u1", "threads", 2, "v1");
  });

  it("isolates a failing tab with an error state and a working retry", async () => {
    const spy = vi.spyOn(postService, "fetchUserPosts").mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(page([makePost("a")]));
    render(<Harness tab="threads" />);

    expect(await screen.findByText("Không tải được nội dung")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Thử lại" }));

    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(1));
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe("ProfileTabPanel replies", () => {
  it("shows a replying-to link for available parents and a deleted notice for tombstoned ones", async () => {
    const parents: ParentReference[] = [
      { id: "p1", author: { id: "x", displayName: "X", username: "xuser" }, deleted: false },
      { id: "p2", deleted: true },
    ];
    vi.spyOn(postService, "fetchUserPosts").mockResolvedValue(
      page([makePost("r1", { parentId: "p1" }), makePost("r2", { parentId: "p2" })], undefined, parents),
    );
    render(<Harness tab="replies" />);

    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(2));
    const link = screen.getByRole("link", { name: "Trả lời @xuser" });
    expect(link).toHaveAttribute("href", "/posts/p1");
    expect(screen.getByText("Bài viết gốc đã bị xóa")).toBeInTheDocument();
  });
});

describe("ProfileTabPanel media & saved", () => {
  it("renders the media tab as a grid of image tiles", async () => {
    vi.spyOn(postService, "fetchUserPosts").mockResolvedValue(
      page([makePost("m1", { imageUrl: "https://img.test/1.jpg" }), makePost("m2", { imageUrls: ["https://img.test/2.jpg", "https://img.test/3.jpg"] })]),
    );
    const { container } = render(<Harness tab="media" />);

    await waitFor(() => expect(container.querySelectorAll("img")).toHaveLength(2));
    expect(screen.queryAllByRole("article")).toHaveLength(0);
  });

  it("shows the saved empty state with its hint", async () => {
    vi.spyOn(postService, "fetchSavedPosts").mockResolvedValue({ posts: [] });
    render(<Harness tab="saved" isOwn />);

    expect(await screen.findByText("Chưa lưu bài viết nào")).toBeInTheDocument();
    expect(screen.getByText("Bấm biểu tượng dấu trang để lưu bài viết")).toBeInTheDocument();
  });

  it("is exposed as a labelled tabpanel", async () => {
    vi.spyOn(postService, "fetchUserPosts").mockResolvedValue(page([makePost("a")]));
    render(<Harness tab="threads" />);

    const panel = await screen.findByRole("tabpanel");
    expect(panel).toHaveAttribute("aria-labelledby", "profile-tab-threads");
    expect(within(panel).getAllByRole("article")).toHaveLength(1);
  });
});

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth/store/auth-store";
import { makeUserProfile } from "@/features/profile/mocks/user-fixtures";
import { resetUserStore, useUserStore } from "@/features/profile/store/user-store";
import * as service from "../services/post-service";
import { resetPostStore, usePostStore } from "../store/post-store";
import type { PostItem } from "../types";
import { PostCard } from "./post-card";

const push = vi.fn();
const usePathname = vi.hoisted(() => vi.fn(() => "/"));
vi.mock("next/navigation", () => ({
  usePathname,
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
}));

const post: PostItem = {
  id: "post-001",
  content: "Nội dung bài viết",
  createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  likesCount: 5,
  commentsCount: 2,
  isLikedByCurrentUser: false,
  isBookmarkedByCurrentUser: false,
  user: { id: "u1", displayName: "Minh Thư", username: "minhthu" },
};

beforeEach(() => {
  resetPostStore();
  resetUserStore();
  push.mockClear();
  vi.restoreAllMocks();
});

describe("PostCard author overlay", () => {
  const authorPost: PostItem = { ...post, user: { id: "author-03", displayName: "Trần Anh Quốc", username: "anquoc.dev" } };

  it("follows the user-store copy of the author after a profile edit", () => {
    useUserStore.getState().actions.upsertUsers(
      [makeUserProfile({ id: "author-03", displayName: "Trần Anh Quốc", username: "anquoc.dev" })],
      "me",
    );
    render(<PostCard post={authorPost} />);
    expect(screen.getByText("Trần Anh Quốc")).toBeInTheDocument();

    act(() => useUserStore.getState().actions.patchUser("author-03", { displayName: "Quốc Mới" }));

    expect(screen.getByText("Quốc Mới")).toBeInTheDocument();
    expect(screen.queryByText("Trần Anh Quốc")).toBeNull();
  });

  it("falls back to the post snapshot while the author is not cached", () => {
    render(<PostCard post={authorPost} />);
    expect(screen.getByText("Trần Anh Quốc")).toBeInTheDocument();
  });
});

describe("PostCard store sync", () => {
  it("seeds the store and updates the count when liking a post not yet cached", async () => {
    render(<PostCard post={post} />);

    await userEvent.click(screen.getByRole("button", { name: "Thích" }));

    expect(usePostStore.getState().posts["post-001"].likesCount).toBe(6);
    expect(screen.getByText("6")).toBeInTheDocument();
  });

  it("keeps two cards of the same post in sync", async () => {
    render(
      <>
        <PostCard post={post} />
        <PostCard post={post} />
      </>,
    );

    await userEvent.click(screen.getAllByRole("button", { name: "Thích" })[0]);

    expect(screen.getAllByText("6")).toHaveLength(2);
  });

  it("persists the like to the service so a later refetch keeps it", async () => {
    const spy = vi.spyOn(service, "setPostLike").mockResolvedValue();
    render(<PostCard post={post} />);

    await userEvent.click(screen.getByRole("button", { name: "Thích" }));
    await userEvent.click(screen.getByRole("button", { name: "Thích" }));

    expect(spy).toHaveBeenNthCalledWith(1, "post-001", true);
    expect(spy).toHaveBeenNthCalledWith(2, "post-001", false);
  });

  it("persists the bookmark to the service", async () => {
    const spy = vi.spyOn(service, "setPostBookmark").mockResolvedValue();
    render(<PostCard post={post} />);

    await userEvent.click(screen.getByRole("button", { name: "Lưu" }));

    expect(spy).toHaveBeenCalledWith("post-001", true);
  });

  it("toggles bookmark through the store", async () => {
    render(<PostCard post={post} />);

    await userEvent.click(screen.getByRole("button", { name: "Lưu" }));

    expect(usePostStore.getState().posts["post-001"].isBookmarkedByCurrentUser).toBe(true);
  });
});

describe("PostCard navigation", () => {
  it("opens the thread from the comment button", async () => {
    render(<PostCard post={post} />);

    await userEvent.click(screen.getByRole("button", { name: "Trả lời" }));

    expect(push).toHaveBeenCalledWith("/posts/post-001");
  });

  it("opens the thread when clicking the content", async () => {
    render(<PostCard post={post} />);

    await userEvent.click(screen.getByText("Nội dung bài viết"));

    expect(push).toHaveBeenCalledWith("/posts/post-001");
  });

  it("does not navigate when clicking author link", async () => {
    render(<PostCard post={post} />);

    await userEvent.click(screen.getByText("Minh Thư"));

    expect(push).not.toHaveBeenCalledWith("/posts/post-001");
  });

  it("does not navigate when the click ends a text selection", () => {
    render(<PostCard post={post} />);
    const content = screen.getByText("Nội dung bài viết");
    window.getSelection()?.selectAllChildren(content);

    fireEvent.click(content);

    expect(push).not.toHaveBeenCalled();
    window.getSelection()?.removeAllRanges();
  });

  it("does not navigate when clicking a media attachment", async () => {
    render(<PostCard post={{ ...post, imageUrls: ["/a.jpg"] }} />);

    await userEvent.click(screen.getByRole("img", { name: "Post attachment" }));

    expect(push).not.toHaveBeenCalled();
  });

  it("does not navigate when opening the card menu", async () => {
    render(<PostCard post={post} />);

    await userEvent.click(screen.getByRole("button", { name: "Thêm" }));

    expect(push).not.toHaveBeenCalled();
  });
});

describe("PostCard pending", () => {
  it("is inert while the post is still being created", () => {
    render(<PostCard post={{ ...post, isPending: true }} />);

    const article = screen.getByRole("article", { hidden: true });
    expect(article).toHaveAttribute("inert");
    expect(article).toHaveAttribute("aria-busy", "true");
  });
});

describe("PostCard detail variant", () => {
  it("does not navigate and shows the stats row", async () => {
    render(<PostCard post={post} variant="detail" />);

    await userEvent.click(screen.getByRole("button", { name: "Trả lời" }));
    await userEvent.click(screen.getByText("Nội dung bài viết"));

    expect(push).not.toHaveBeenCalled();
    expect(screen.getByText(/lượt thích/)).toBeInTheDocument();
    expect(screen.getByText(/câu trả lời/)).toBeInTheDocument();
  });

  it("links to the parent post when replying", () => {
    render(<PostCard post={{ ...post, parentId: "post-000" }} variant="detail" replyToUsername="minh" />);

    expect(screen.getByRole("link", { name: "Trả lời @minh" })).toHaveAttribute("href", "/posts/post-000");
  });
});

describe("PostCard rich content", () => {
  it("opens the tag page, not the thread, when clicking a hashtag", async () => {
    render(<PostCard post={{ ...post, content: "Moodboard #Design" }} />);

    await userEvent.click(screen.getByRole("link", { name: "#Design" }));

    expect(push).not.toHaveBeenCalledWith("/posts/post-001");
  });

  it("highlights search tokens in the content", () => {
    const { container } = render(<PostCard post={post} highlightTokens={["noi", "dung"]} />);

    expect(Array.from(container.querySelectorAll("mark")).map((mark) => mark.textContent)).toEqual(["Nội", "dung"]);
  });
});

describe("PostCard media", () => {
  const gallery = { ...post, imageUrls: ["/a.jpg", "/b.jpg", "/c.jpg"] };

  it("opens the lightbox on the clicked image and pages forward", async () => {
    render(<PostCard post={gallery} />);

    await userEvent.click(screen.getByRole("img", { name: "Attachment 2" }));
    expect(screen.getByText("2 / 3")).toBeInTheDocument();

    const buttons = within(screen.getByRole("dialog")).getAllByRole("button");
    await userEvent.click(buttons[buttons.length - 1]);
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
  });

  it("renders a +N overlay beyond 4 images", () => {
    render(<PostCard post={{ ...post, imageUrls: ["/1.jpg", "/2.jpg", "/3.jpg", "/4.jpg", "/5.jpg", "/6.jpg"] }} />);

    expect(screen.getByText("+2")).toBeInTheDocument();
  });
});

describe("PostCard owner state", () => {
  afterEach(() => {
    useAuthStore.setState({ user: null });
  });

  it("never runs owner actions for another author's card", () => {
    usePathname.mockClear();
    render(<PostCard post={post} />);

    expect(screen.getByRole("button", { name: "Thêm" })).toBeInTheDocument();
    expect(usePathname).not.toHaveBeenCalled();
  });

  it("renders nothing for a deleted post", () => {
    usePostStore.getState().actions.markDeleted(["post-001"]);

    const { container } = render(<PostCard post={post} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("hides a hidden like count from other viewers", () => {
    render(<PostCard post={{ ...post, hideLikeCount: true }} />);

    expect(screen.queryByText("5")).toBeNull();
  });

  it("shows a hidden like count to the owner with a hint", () => {
    useAuthStore.setState({ user: { id: "u1", email: "u1@ysocial.dev" } });

    render(<PostCard post={{ ...post, hideLikeCount: true }} />);

    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByTitle("Chỉ bạn thấy số lượt thích")).toBeInTheDocument();
  });

  it("hides the detail stats likes row from other viewers", () => {
    render(<PostCard post={{ ...post, hideLikeCount: true }} variant="detail" />);

    expect(screen.queryByText(/lượt thích/)).toBeNull();
  });

  it("labels edited posts", () => {
    render(<PostCard post={{ ...post, isEdited: true }} />);

    expect(screen.getByText(/Đã chỉnh sửa/)).toBeInTheDocument();
  });

  it("shows the pinned badge on feed & detail, not on compact replies", () => {
    const { unmount } = render(<PostCard post={{ ...post, isPinned: true }} />);
    expect(screen.getByText("Đã ghim")).toBeInTheDocument();
    unmount();

    render(<PostCard post={{ ...post, isPinned: true }} variant="compact" />);
    expect(screen.queryByText("Đã ghim")).toBeNull();
  });

  it("swaps the content for the inline editor from the owner menu", async () => {
    useAuthStore.setState({ user: { id: "u1", email: "u1@ysocial.dev" } });
    render(<PostCard post={post} />);

    await userEvent.click(screen.getByRole("button", { name: "Thêm" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Chỉnh sửa" }));

    expect(screen.getByRole("textbox", { name: "Nội dung bài viết" })).toHaveValue("Nội dung bài viết");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});

describe("PostCard blocked author", () => {
  it("renders nothing for a blocked author (fallback guard for lists that are not refilled)", () => {
    const { container, rerender } = render(<PostCard post={post} />);
    expect(screen.getByText("Nội dung bài viết")).toBeInTheDocument();

    act(() => usePostStore.getState().actions.excludeAuthor("u1", "blocked"));
    rerender(<PostCard post={post} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("still renders a muted author", () => {
    usePostStore.getState().actions.excludeAuthor("u1", "muted");

    render(<PostCard post={post} />);

    expect(screen.getByText("Nội dung bài viết")).toBeInTheDocument();
  });
});

import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as service from "../services/post-service";
import { resetPostStore, usePostStore } from "../store/post-store";
import type { PostItem } from "../types";
import { PostCard } from "./post-card";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, back: vi.fn() }),
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
  push.mockClear();
  vi.restoreAllMocks();
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

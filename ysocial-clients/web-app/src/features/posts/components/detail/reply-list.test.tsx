import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetPostStore, usePostStore } from "../../store/post-store";
import type { PostItem } from "../../types";
import { ReplyList } from "./reply-list";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

const makePost = (id: string, parentId?: string): PostItem => ({
  id,
  parentId,
  content: `nội dung ${id}`,
  createdAt: new Date().toISOString(),
  likesCount: 0,
  commentsCount: 0,
  isLikedByCurrentUser: false,
  isBookmarkedByCurrentUser: false,
  user: { id: "u1", displayName: "User", username: "user" },
});

/** Seeds a parent with the given replies and per-reply child counts. */
function seedThread(parentId: string, childCounts: number[]) {
  const { upsertPosts, setReplies } = usePostStore.getState().actions;
  const parent = makePost(parentId);
  const replies = childCounts.map((_, i) => makePost(`${parentId}-r${i}`, parentId));
  upsertPosts([parent, ...replies]);
  setReplies(parentId, replies.map((r) => r.id));
  replies.forEach((reply, i) => {
    const children = Array.from({ length: childCounts[i] }, (_, j) => makePost(`${reply.id}-c${j}`, reply.id));
    upsertPosts(children);
    setReplies(reply.id, children.map((c) => c.id));
  });
}

beforeEach(() => {
  resetPostStore();
});

describe("ReplyList", () => {
  it("shows the empty state when there are no replies", () => {
    seedThread("p", []);

    render(<ReplyList parentId="p" />);

    expect(screen.getByText("Chưa ai lên tiếng, mở bát đi!")).toBeInTheDocument();
  });

  it("shows two children inline and links to the rest", () => {
    seedThread("p", [3]);

    render(<ReplyList parentId="p" />);

    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(screen.getByText("nội dung p-r0-c0")).toBeInTheDocument();
    expect(screen.getByText("nội dung p-r0-c1")).toBeInTheDocument();
    expect(screen.queryByText("nội dung p-r0-c2")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Xem thêm 1 câu trả lời" })).toHaveAttribute("href", "/posts/p-r0");
  });

  it("omits the view-more link when all children fit", () => {
    seedThread("p", [2]);

    render(<ReplyList parentId="p" />);

    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(screen.queryByRole("link", { name: /Xem thêm/ })).not.toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth/store/auth-store";
import { useOwnerActions } from "../hooks/use-owner-actions";
import * as service from "../services/post-service";
import { resetPostStore, usePostStore } from "../store/post-store";
import type { PostItem } from "../types";
import { PostCardMenu } from "./post-card-menu";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const post: PostItem = {
  id: "p1",
  content: "Nội dung",
  createdAt: "2026-10-01T00:00:00.000Z",
  likesCount: 2,
  commentsCount: 0,
  isLikedByCurrentUser: false,
  isBookmarkedByCurrentUser: false,
  user: { id: "u1", displayName: "Minh Thư", username: "minhthu" },
};

/** Owner menu as `PostCard` wires it: the card's single owner-actions runner passed down. */
function OwnerMenu(props: Omit<React.ComponentProps<typeof PostCardMenu>, "owner">) {
  return <PostCardMenu {...props} owner={useOwnerActions(props.post.id)} />;
}

const openMenu = () => userEvent.click(screen.getByRole("button", { name: "Thêm" }));
const item = (name: string) => screen.queryByRole("menuitem", { name });

beforeEach(() => {
  resetPostStore();
  vi.restoreAllMocks();
  useAuthStore.setState({ user: { id: "u1", email: "u1@ysocial.dev" } });
  usePostStore.getState().actions.upsertPosts([post, { ...post, id: "r1", parentId: "p1" }]);
});

afterEach(() => {
  useAuthStore.setState({ user: null });
});

describe("PostCardMenu", () => {
  it("shows owner actions to the owner", async () => {
    render(<OwnerMenu post={post} onEdit={vi.fn()} />);
    await openMenu();

    for (const name of ["Chỉnh sửa", "Ghim lên trang cá nhân", "Ẩn số lượt thích", "Xoá"]) expect(item(name)).toBeInTheDocument();
    expect(item("Ẩn @minhthu")).toBeNull();
    expect(item("Chặn @minhthu")).toBeNull();
  });

  it("shows viewer actions to non-owners", async () => {
    render(<PostCardMenu post={post} onEdit={vi.fn()} />);
    await openMenu();

    for (const name of ["Không quan tâm", "Ẩn @minhthu", "Chặn @minhthu", "Sao chép liên kết", "Báo cáo bài viết"]) {
      expect(item(name)).toBeInTheDocument();
    }
    expect(item("Chỉnh sửa")).toBeNull();
    expect(item("Xoá")).toBeNull();
  });

  it("offers Unpin for a pinned post and no Pin on replies", async () => {
    const { unmount } = render(<OwnerMenu post={{ ...post, isPinned: true }} onEdit={vi.fn()} />);
    await openMenu();
    expect(item("Bỏ ghim")).toBeInTheDocument();
    unmount();

    render(<OwnerMenu post={{ ...post, id: "r1", parentId: "p1" }} onEdit={vi.fn()} />);
    await openMenu();
    expect(item("Ghim lên trang cá nhân")).toBeNull();
    expect(item("Chỉnh sửa")).toBeInTheDocument();
  });

  it("disables owner items while an op is pending", async () => {
    usePostStore.getState().actions.beginOwnerOp("p1", "edit");
    render(<OwnerMenu post={post} onEdit={vi.fn()} />);
    await openMenu();

    for (const name of ["Chỉnh sửa", "Ghim lên trang cá nhân", "Ẩn số lượt thích", "Xoá"]) {
      expect(item(name)).toHaveAttribute("aria-disabled", "true");
    }
  });

  it("calls onEdit from the Edit item", async () => {
    const onEdit = vi.fn();
    render(<OwnerMenu post={post} onEdit={onEdit} />);
    await openMenu();

    await userEvent.click(item("Chỉnh sửa")!);

    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("deletes only after confirming", async () => {
    const spy = vi.spyOn(service, "deletePost").mockResolvedValue({ deletedIds: ["p1"] });
    render(<OwnerMenu post={post} onEdit={vi.fn()} />);

    await openMenu();
    await userEvent.click(item("Xoá")!);
    expect(screen.getByRole("alertdialog", { name: "Xoá bài viết?" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Huỷ" }));
    expect(spy).not.toHaveBeenCalled();

    await openMenu();
    await userEvent.click(item("Xoá")!);
    await userEvent.click(screen.getByRole("button", { name: "Xoá" }));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("p1", "u1");
  });
});

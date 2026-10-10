import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth/store/auth-store";
import * as relationService from "@/features/profile/services/relation-service";
import * as userService from "@/features/profile/services/user-service";
import { resetOpLedger } from "@/features/profile/store/op-ledger";
import { resetRelationStore, useRelationStore } from "@/features/profile/store/relation-store";
import { resetUserStore } from "@/features/profile/store/user-store";
import { useOwnerActions } from "../hooks/use-owner-actions";
import * as service from "../services/post-service";
import { resetPostStore, usePostStore } from "../store/post-store";
import type { PostItem } from "../types";
import { PostCardMenu } from "./post-card-menu";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

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
  resetUserStore();
  resetRelationStore();
  resetOpLedger();
  toast.success.mockClear();
  toast.error.mockClear();
  toast.info.mockClear();
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

describe("PostCardMenu relation actions", () => {
  const AUTHOR = "u1";
  const ACTOR = "v1";

  beforeEach(() => {
    useAuthStore.setState({ user: { id: ACTOR, email: "v1@ysocial.dev" } });
    vi.spyOn(userService, "fetchUser").mockResolvedValue(null);
    vi.spyOn(relationService, "fetchFollowRequestCount").mockResolvedValue(0);
  });

  it("mutes the author with an Undo toast that unmutes", async () => {
    const setMuted = vi.spyOn(relationService, "setMuted").mockResolvedValue();
    render(<PostCardMenu post={post} onEdit={vi.fn()} />);
    await openMenu();

    await userEvent.click(item("Ẩn @minhthu")!);

    expect(setMuted).toHaveBeenCalledWith(AUTHOR, true, ACTOR);
    expect(usePostStore.getState().excludedAuthors[AUTHOR]).toEqual({ muted: true });
    const [message, options] = toast.info.mock.calls.at(-1) as [string, { action: { label: string; onClick: () => void } }];
    expect(message).toBe("Đã ẩn @minhthu khỏi bảng tin");
    expect(options.action.label).toBe("Hoàn tác");

    options.action.onClick();
    expect(setMuted).toHaveBeenLastCalledWith(AUTHOR, false, ACTOR);
  });

  it("offers Unmute for a muted author", async () => {
    useRelationStore.getState().actions.setFlag(ACTOR, "muted", AUTHOR, true);
    const setMuted = vi.spyOn(relationService, "setMuted").mockResolvedValue();
    render(<PostCardMenu post={post} onEdit={vi.fn()} />);
    await openMenu();
    expect(item("Ẩn @minhthu")).toBeNull();

    await userEvent.click(item("Bỏ ẩn @minhthu")!);

    expect(setMuted).toHaveBeenCalledWith(AUTHOR, false, ACTOR);
    expect(toast.info).toHaveBeenCalledWith("Đã bỏ ẩn @minhthu");
  });

  it("shows an error toast when muting fails", async () => {
    vi.spyOn(relationService, "setMuted").mockRejectedValue(new Error("boom"));
    render(<PostCardMenu post={post} onEdit={vi.fn()} />);
    await openMenu();

    await userEvent.click(item("Ẩn @minhthu")!);

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith("Không thể cập nhật, thử lại nhé"));
  });

  it("asks before blocking: Cancel does nothing, Confirm blocks", async () => {
    const setBlocked = vi.spyOn(relationService, "setBlocked").mockResolvedValue();
    render(<PostCardMenu post={post} onEdit={vi.fn()} />);

    await openMenu();
    await userEvent.click(item("Chặn @minhthu")!);
    expect(screen.getByRole("alertdialog", { name: "Chặn @minhthu?" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Huỷ" }));
    expect(setBlocked).not.toHaveBeenCalled();

    await openMenu();
    await userEvent.click(item("Chặn @minhthu")!);
    await userEvent.click(screen.getByRole("button", { name: "Chặn" }));

    expect(setBlocked).toHaveBeenCalledWith(AUTHOR, true, ACTOR);
    expect(usePostStore.getState().excludedAuthors[AUTHOR]).toEqual({ blocked: true });
    await vi.waitFor(() => expect(toast.success).toHaveBeenCalledWith("Đã chặn @minhthu"));
  });

  it("shows an error toast when blocking fails", async () => {
    vi.spyOn(relationService, "setBlocked").mockRejectedValue(new Error("boom"));
    render(<PostCardMenu post={post} onEdit={vi.fn()} />);
    await openMenu();
    await userEvent.click(item("Chặn @minhthu")!);

    await userEvent.click(screen.getByRole("button", { name: "Chặn" }));

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith("Không thể cập nhật, thử lại nhé"));
    expect(usePostStore.getState().excludedAuthors[AUTHOR]).toBeUndefined();
  });

  it("hides mute and block from a guest", async () => {
    useAuthStore.setState({ user: null });
    render(<PostCardMenu post={post} onEdit={vi.fn()} />);
    await openMenu();

    expect(item("Ẩn @minhthu")).toBeNull();
    expect(item("Chặn @minhthu")).toBeNull();
    expect(item("Sao chép liên kết")).toBeInTheDocument();
  });

  it("never shows mute or block on the owner's own posts", async () => {
    render(<OwnerMenu post={post} onEdit={vi.fn()} />);
    await openMenu();

    expect(item("Ẩn @minhthu")).toBeNull();
    expect(item("Chặn @minhthu")).toBeNull();
  });
});

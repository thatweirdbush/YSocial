import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth";
import { resetPostStore } from "@/features/posts/store/post-store";
import { makeUserProfile } from "../mocks/user-fixtures";
import * as relationService from "../services/relation-service";
import * as userService from "../services/user-service";
import { resetOpLedger } from "../store/op-ledger";
import { resetRelationStore } from "../store/relation-store";
import { resetUserStore } from "../store/user-store";
import type { UserProfile } from "../types";
import { ProfileHeaderMenu } from "./profile-header-menu";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

const user = (overrides: Partial<UserProfile> = {}): UserProfile =>
  makeUserProfile({ id: "u1", displayName: "Minh Thư", username: "minhthu", ...overrides });

const openMenu = () => userEvent.click(screen.getByRole("button", { name: "Thêm" }));
const item = (name: string) => screen.queryByRole("menuitem", { name });

beforeEach(() => {
  vi.restoreAllMocks();
  resetUserStore();
  resetRelationStore();
  resetPostStore();
  resetOpLedger();
  toast.success.mockClear();
  toast.error.mockClear();
  toast.info.mockClear();
  useAuthStore.setState({ user: { id: "v1", email: "v1@ysocial.dev" } });
  vi.spyOn(userService, "fetchUser").mockResolvedValue(null);
  vi.spyOn(relationService, "fetchFollowRequestCount").mockResolvedValue(0);
});

afterEach(() => {
  useAuthStore.setState({ user: null });
});

describe("ProfileHeaderMenu", () => {
  it("is hidden on the viewer's own profile and for a guest", () => {
    const { container, rerender } = render(<ProfileHeaderMenu user={user({ id: "v1" })} />);
    expect(container).toBeEmptyDOMElement();

    useAuthStore.setState({ user: null });
    rerender(<ProfileHeaderMenu user={user()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("offers mute and block, but close friends only for an accepted follow", async () => {
    const { unmount } = render(<ProfileHeaderMenu user={user({ followStatus: "none" })} />);
    await openMenu();
    expect(item("Ẩn @minhthu")).toBeInTheDocument();
    expect(item("Chặn @minhthu")).toBeInTheDocument();
    expect(item("Thêm vào bạn thân")).toBeNull();
    unmount();

    render(<ProfileHeaderMenu user={user({ followStatus: "accepted", isFollowing: true })} />);
    await openMenu();
    expect(item("Thêm vào bạn thân")).toBeInTheDocument();
  });

  it("toggles the close friend flag", async () => {
    const setCloseFriend = vi.spyOn(relationService, "setCloseFriend").mockResolvedValue();
    render(<ProfileHeaderMenu user={user({ followStatus: "accepted", isFollowing: true })} />);
    await openMenu();

    await userEvent.click(item("Thêm vào bạn thân")!);

    expect(setCloseFriend).toHaveBeenCalledWith("u1", true, "v1");
    expect(toast.success).toHaveBeenCalledWith("Đã thêm @minhthu vào bạn thân");
  });

  it("offers removal for a marked close friend", async () => {
    const setCloseFriend = vi.spyOn(relationService, "setCloseFriend").mockResolvedValue();
    render(<ProfileHeaderMenu user={user({ followStatus: "accepted", isFollowing: true, viewerMarkedCloseFriend: true })} />);
    await openMenu();

    await userEvent.click(item("Xoá khỏi bạn thân")!);

    expect(setCloseFriend).toHaveBeenCalledWith("u1", false, "v1");
  });

  it("mutes and unmutes", async () => {
    const setMuted = vi.spyOn(relationService, "setMuted").mockResolvedValue();
    const { unmount } = render(<ProfileHeaderMenu user={user()} />);
    await openMenu();
    await userEvent.click(item("Ẩn @minhthu")!);
    expect(setMuted).toHaveBeenCalledWith("u1", true, "v1");
    unmount();

    render(<ProfileHeaderMenu user={user({ isMuted: true })} />);
    await openMenu();
    await userEvent.click(item("Bỏ ẩn @minhthu")!);
    expect(setMuted).toHaveBeenLastCalledWith("u1", false, "v1");
  });

  it("blocks only after confirming", async () => {
    const setBlocked = vi.spyOn(relationService, "setBlocked").mockResolvedValue();
    render(<ProfileHeaderMenu user={user()} />);

    await openMenu();
    await userEvent.click(item("Chặn @minhthu")!);
    await userEvent.click(screen.getByRole("button", { name: "Huỷ" }));
    expect(setBlocked).not.toHaveBeenCalled();

    await openMenu();
    await userEvent.click(item("Chặn @minhthu")!);
    await userEvent.click(screen.getByRole("button", { name: "Chặn" }));

    expect(setBlocked).toHaveBeenCalledWith("u1", true, "v1");
  });

  it("shows an error toast when an action fails", async () => {
    vi.spyOn(relationService, "setMuted").mockRejectedValue(new Error("boom"));
    render(<ProfileHeaderMenu user={user()} />);
    await openMenu();

    await userEvent.click(item("Ẩn @minhthu")!);

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith("Không thể cập nhật, thử lại nhé"));
  });
});

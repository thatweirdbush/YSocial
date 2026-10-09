import { render, screen, waitFor } from "@testing-library/react";
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
import { BlockedUserList } from "./blocked-user-list";
import { MutedUserList } from "./muted-user-list";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

const person = (id: string) => makeUserProfile({ id, displayName: `User ${id}`, username: `user.${id}` });

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

describe("BlockedUserList", () => {
  it("shows the empty state", async () => {
    vi.spyOn(relationService, "fetchBlockedUsers").mockResolvedValue({ users: [] });
    render(<BlockedUserList />);

    expect(await screen.findByText("Chưa chặn ai")).toBeInTheDocument();
  });

  it("lists blocked users for the actor and unblocks a row optimistically", async () => {
    const fetchBlocked = vi.spyOn(relationService, "fetchBlockedUsers").mockResolvedValue({ users: [person("a"), person("b")] });
    const setBlocked = vi.spyOn(relationService, "setBlocked").mockResolvedValue();
    render(<BlockedUserList />);
    await screen.findByText("User a");
    expect(fetchBlocked).toHaveBeenCalledWith({ query: "", page: 1 }, "v1");

    await userEvent.click(screen.getAllByRole("button", { name: "Bỏ chặn" })[0]);

    expect(screen.queryByText("User a")).toBeNull();
    expect(setBlocked).toHaveBeenCalledWith("a", false, "v1");
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Đã bỏ chặn @user.a"));
    expect(screen.getByText("User b")).toBeInTheDocument();
  });

  it("restores the row and shows an error toast when unblocking fails", async () => {
    vi.spyOn(relationService, "fetchBlockedUsers").mockResolvedValue({ users: [person("a")] });
    vi.spyOn(relationService, "setBlocked").mockRejectedValue(new Error("boom"));
    render(<BlockedUserList />);
    await screen.findByText("User a");

    await userEvent.click(screen.getByRole("button", { name: "Bỏ chặn" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Không thể cập nhật, thử lại nhé"));
    expect(await screen.findByText("User a")).toBeInTheDocument();
  });
});

describe("MutedUserList", () => {
  it("shows the empty state", async () => {
    vi.spyOn(relationService, "fetchMutedUsers").mockResolvedValue({ users: [] });
    render(<MutedUserList />);

    expect(await screen.findByText("Chưa ẩn ai")).toBeInTheDocument();
  });

  it("unmutes a row optimistically", async () => {
    vi.spyOn(relationService, "fetchMutedUsers").mockResolvedValue({ users: [person("a")] });
    const setMuted = vi.spyOn(relationService, "setMuted").mockResolvedValue();
    render(<MutedUserList />);
    await screen.findByText("User a");

    await userEvent.click(screen.getByRole("button", { name: "Bỏ ẩn" }));

    expect(screen.queryByText("User a")).toBeNull();
    expect(setMuted).toHaveBeenCalledWith("a", false, "v1");
    await waitFor(() => expect(toast.info).toHaveBeenCalledWith("Đã bỏ ẩn @user.a"));
  });

  it("restores the row when unmuting fails", async () => {
    vi.spyOn(relationService, "fetchMutedUsers").mockResolvedValue({ users: [person("a")] });
    vi.spyOn(relationService, "setMuted").mockRejectedValue(new Error("boom"));
    render(<MutedUserList />);
    await screen.findByText("User a");

    await userEvent.click(screen.getByRole("button", { name: "Bỏ ẩn" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Không thể cập nhật, thử lại nhé"));
    expect(await screen.findByText("User a")).toBeInTheDocument();
  });
});

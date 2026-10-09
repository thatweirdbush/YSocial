import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth/store/auth-store";
import { makeUserProfile } from "../mocks/user-fixtures";
import * as service from "../services/user-service";
import { resetOpLedger } from "../store/op-ledger";
import { resetUserStore, useUserStore } from "../store/user-store";
import { FollowButton } from "./follow-button";

const toast = vi.hoisted(() => ({ success: vi.fn(), info: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
}));

const statusOf = (actorId: string, id: string) => useUserStore.getState().follows[actorId]?.status[id];

beforeEach(() => {
  resetUserStore();
  resetOpLedger();
  vi.restoreAllMocks();
  push.mockClear();
  toast.success.mockClear();
  toast.info.mockClear();
  toast.error.mockClear();
  useAuthStore.setState({ user: { id: "v1", email: "v1@ysocial.dev" } });
  useUserStore.getState().actions.upsertUsers(
    [
      makeUserProfile({ id: "u1", displayName: "Minh Thư", username: "minhthu", followersCount: 10 }),
      makeUserProfile({ id: "u2", displayName: "Kín Đáo", username: "kindao", isPrivate: true }),
    ],
    "v1",
  );
});

afterEach(() => {
  useAuthStore.setState({ user: null });
});

describe("FollowButton", () => {
  it("toggles follow in the store and persists it to the service", async () => {
    const spy = vi.spyOn(service, "followUser").mockResolvedValue("accepted");
    render(<FollowButton userId="u1" />);

    const button = screen.getByRole("button", { name: "Theo dõi" });
    expect(button).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(button);

    expect(statusOf("v1", "u1")).toBe("accepted");
    expect(useUserStore.getState().users.u1.followersCount).toBe(11);
    expect(screen.getByRole("button", { name: "Đang theo dõi" })).toHaveAttribute("aria-pressed", "true");
    expect(spy).toHaveBeenCalledWith("u1", "v1");
  });

  it("renders nothing for an unknown user", () => {
    const { container } = render(<FollowButton userId="nope" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing while the viewer's follow state is unknown (never guesses Follow)", () => {
    useAuthStore.setState({ user: { id: "v2", email: "v2@ysocial.dev" } });
    const { container } = render(<FollowButton userId="u1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("reserveSpace: keeps an invisible, non-interactive placeholder while unknown", () => {
    const { container } = render(<FollowButton userId="nope" reserveSpace />);

    const placeholder = container.firstElementChild;
    expect(placeholder).toHaveAttribute("aria-hidden", "true");
    expect(placeholder).toHaveClass("invisible");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("reverts and shows the translated error toast when the write fails", async () => {
    vi.spyOn(service, "followUser").mockRejectedValue(new Error("boom"));
    render(<FollowButton userId="u1" />);

    await userEvent.click(screen.getByRole("button", { name: "Theo dõi" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Không thể cập nhật theo dõi, thử lại nhé"));
    expect(statusOf("v1", "u1")).toBeUndefined();
  });

  it("shows translated toasts", async () => {
    vi.spyOn(service, "followUser").mockResolvedValue("accepted");
    vi.spyOn(service, "unfollowUser").mockResolvedValue();
    render(<FollowButton userId="u1" />);

    await userEvent.click(screen.getByRole("button", { name: "Theo dõi" }));
    expect(toast.success).toHaveBeenCalledWith("Đã theo dõi @minhthu");

    await userEvent.click(screen.getByRole("button", { name: "Đang theo dõi" }));
    expect(toast.info).toHaveBeenCalledWith("Đã bỏ theo dõi @minhthu");
  });
});

describe("FollowButton private accounts", () => {
  it("renders Requested after following a private account and says the request was sent", async () => {
    vi.spyOn(service, "followUser").mockResolvedValue("pending");
    render(<FollowButton userId="u2" />);

    await userEvent.click(screen.getByRole("button", { name: "Theo dõi" }));

    expect(statusOf("v1", "u2")).toBe("pending");
    expect(screen.getByRole("button", { name: "Đã yêu cầu" })).toHaveAttribute("aria-pressed", "false");
    expect(toast.success).toHaveBeenCalledWith("Đã gửi yêu cầu theo dõi @kindao");
  });

  it("cancels a pending request on click without a confirm dialog", async () => {
    useUserStore.getState().actions.setFollowStatus("v1", "u2", "pending");
    const unfollow = vi.spyOn(service, "unfollowUser").mockResolvedValue();
    render(<FollowButton userId="u2" confirmUnfollow />);

    await userEvent.click(screen.getByRole("button", { name: "Đã yêu cầu" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(unfollow).toHaveBeenCalledWith("u2", "v1");
    expect(statusOf("v1", "u2")).toBeUndefined();
    expect(screen.getByRole("button", { name: "Theo dõi" })).toBeInTheDocument();
    expect(toast.info).toHaveBeenCalledWith("Đã hủy yêu cầu theo dõi @kindao");
  });

  it("still asks before unfollowing an accepted follow when confirmUnfollow is set", async () => {
    useUserStore.getState().actions.setFollowStatus("v1", "u1", "accepted");
    const unfollow = vi.spyOn(service, "unfollowUser").mockResolvedValue();
    render(<FollowButton userId="u1" confirmUnfollow />);

    await userEvent.click(screen.getByRole("button", { name: "Đang theo dõi" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(unfollow).not.toHaveBeenCalled();
  });
});

describe("FollowButton guest", () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null });
    useUserStore.getState().actions.upsertUsers([makeUserProfile({ id: "u1", displayName: "Minh Thư", username: "minhthu" })], "me");
  });

  it("stays visible and sends the guest to the login page without calling the service", async () => {
    const follow = vi.spyOn(service, "followUser").mockResolvedValue("accepted");
    render(<FollowButton userId="u1" />);

    await userEvent.click(screen.getByRole("button", { name: "Theo dõi" }));

    expect(push).toHaveBeenCalledWith("/login");
    expect(follow).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(statusOf("me", "u1")).toBeUndefined();
  });
});

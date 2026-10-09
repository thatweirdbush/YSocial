import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth/store/auth-store";
import { makeUserProfile } from "../mocks/user-fixtures";
import * as service from "../services/user-service";
import { resetUserStore, useUserStore } from "../store/user-store";
import { FollowButton } from "./follow-button";

const toast = vi.hoisted(() => ({ success: vi.fn(), info: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

beforeEach(() => {
  resetUserStore();
  vi.restoreAllMocks();
  useAuthStore.setState({ user: { id: "v1", email: "v1@ysocial.dev" } });
  useUserStore.getState().actions.upsertUsers(
    [makeUserProfile({ id: "u1", displayName: "Minh Thư", username: "minhthu", followersCount: 10 })],
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

    expect(useUserStore.getState().follows.v1.ids.u1).toBe(true);
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
    expect(useUserStore.getState().follows.v1.ids.u1).toBeUndefined();
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

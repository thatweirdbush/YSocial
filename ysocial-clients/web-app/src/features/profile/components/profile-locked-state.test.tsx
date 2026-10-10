import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProfileLockedState } from "./profile-locked-state";

describe("ProfileLockedState", () => {
  it("explains a private profile", () => {
    render(<ProfileLockedState variant="private" username="huyvo" />);

    expect(screen.getByRole("heading", { name: "Tài khoản này là riêng tư" })).toBeInTheDocument();
    expect(screen.getByText("Theo dõi để xem bài viết của họ.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("offers Unblock for a profile the viewer blocked", async () => {
    const onUnblock = vi.fn();
    render(<ProfileLockedState variant="blocked" username="huyvo" onUnblock={onUnblock} />);

    expect(screen.getByRole("heading", { name: "Bạn đã chặn @huyvo" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Bỏ chặn" }));

    expect(onUnblock).toHaveBeenCalledTimes(1);
  });

  it("shows an unavailable profile without any action", () => {
    render(<ProfileLockedState variant="unavailable" username="huyvo" />);

    expect(screen.getByRole("heading", { name: "Hồ sơ không khả dụng" })).toBeInTheDocument();
    expect(screen.getByText("Bạn không thể xem hồ sơ này.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

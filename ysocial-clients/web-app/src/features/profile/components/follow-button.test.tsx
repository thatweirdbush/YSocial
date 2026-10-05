import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as service from "../services/user-service";
import { resetUserStore, useUserStore } from "../store/user-store";
import { FollowButton } from "./follow-button";

beforeEach(() => {
  resetUserStore();
  vi.restoreAllMocks();
  useUserStore.getState().actions.upsertUsers([
    { id: "u1", displayName: "Minh Thư", username: "minhthu", followersCount: 10, followingCount: 0, isFollowing: false },
  ]);
});

describe("FollowButton", () => {
  it("toggles follow in the store and persists it to the service", async () => {
    const spy = vi.spyOn(service, "setFollow").mockResolvedValue();
    render(<FollowButton userId="u1" />);

    const button = screen.getByRole("button", { name: "Theo dõi" });
    expect(button).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(button);

    expect(useUserStore.getState().users.u1).toMatchObject({ isFollowing: true, followersCount: 11 });
    expect(screen.getByRole("button", { name: "Đang theo dõi" })).toHaveAttribute("aria-pressed", "true");
    expect(spy).toHaveBeenCalledWith("u1", true);
  });

  it("renders nothing for an unknown user", () => {
    const { container } = render(<FollowButton userId="nope" />);
    expect(container).toBeEmptyDOMElement();
  });
});

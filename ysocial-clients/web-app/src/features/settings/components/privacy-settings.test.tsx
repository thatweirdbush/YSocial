import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth";
import { resetPostStore } from "@/features/posts/store/post-store";
import * as relationService from "@/features/profile/services/relation-service";
import * as userService from "@/features/profile/services/user-service";
import { resetOpLedger } from "@/features/profile/store/op-ledger";
import { ensureRelationSets, resetRelationStore, useRelationStore } from "@/features/profile/store/relation-store";
import { resetUserStore } from "@/features/profile/store/user-store";
import { __resetBlockGraph } from "@/mocks/block-graph";
import { __resetPrivacy, isPrivate } from "@/mocks/privacy";
import { __resetRelationGraph } from "@/mocks/relation-graph";
import { PrivacySettings } from "./privacy-settings";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/settings/privacy",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

const WAIT = { timeout: 3000 };
// `hidden`: while the confirm dialog is open the rest of the page is aria-hidden
const privacySwitch = () => screen.getByRole("switch", { name: "Tài khoản riêng tư", hidden: true });

beforeEach(async () => {
  vi.restoreAllMocks();
  resetUserStore();
  resetRelationStore();
  resetPostStore();
  resetOpLedger();
  __resetRelationGraph();
  __resetBlockGraph();
  __resetPrivacy();
  userService.__resetMockUsers();
  toast.success.mockClear();
  toast.error.mockClear();
  useAuthStore.setState({ user: { id: "1", email: "member@ysocial.dev" } });
  await ensureRelationSets("1");
});

afterEach(() => {
  useAuthStore.setState({ user: null });
});

describe("PrivacySettings", () => {
  it("reflects the private account state of the viewer", async () => {
    render(<PrivacySettings />);

    await waitFor(() => expect(privacySwitch()).toHaveAttribute("aria-checked", "true"), WAIT);
    expect(screen.getByText("Chỉ người theo dõi được bạn chấp thuận mới xem được bài viết của bạn.")).toBeInTheDocument();
  });

  it("asks before going public and shows how many requests get accepted", async () => {
    const setPrivateAccount = vi.spyOn(relationService, "setPrivateAccount");
    render(<PrivacySettings />);

    await userEvent.click(privacySwitch());

    const dialog = await screen.findByRole("alertdialog", { name: "Chuyển sang công khai?" });
    expect(dialog).toHaveTextContent("4 yêu cầu theo dõi sẽ được tự động chấp nhận.");
    expect(setPrivateAccount).not.toHaveBeenCalled();
    expect(privacySwitch()).toHaveAttribute("aria-checked", "true");

    await userEvent.click(screen.getByRole("button", { name: "Chuyển sang công khai" }));

    await waitFor(() => expect(setPrivateAccount).toHaveBeenCalledWith(false, "1"), WAIT);
    await waitFor(() => expect(isPrivate("1")).toBe(false), WAIT);
    expect(privacySwitch()).toHaveAttribute("aria-checked", "false");
    expect(useRelationStore.getState().byViewer["1"].requestCount).toBe(0);
  });

  it("cancelling the dialog keeps the account private", async () => {
    const setPrivateAccount = vi.spyOn(relationService, "setPrivateAccount");
    render(<PrivacySettings />);

    await userEvent.click(privacySwitch());
    await userEvent.click(await screen.findByRole("button", { name: "Huỷ" }));

    expect(setPrivateAccount).not.toHaveBeenCalled();
    expect(privacySwitch()).toHaveAttribute("aria-checked", "true");
  });

  it("goes public without the request line when nothing is pending", async () => {
    useRelationStore.getState().actions.setRequestCount("1", 0);
    render(<PrivacySettings />);

    await userEvent.click(privacySwitch());

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).not.toHaveTextContent("yêu cầu theo dõi sẽ được tự động chấp nhận");
  });

  it("turning private again needs no dialog", async () => {
    vi.spyOn(relationService, "setPrivateAccount").mockResolvedValue({ acceptedCount: 0 });
    useRelationStore.getState().actions.setPrivate("1", false);
    render(<PrivacySettings />);

    await userEvent.click(privacySwitch());

    expect(screen.queryByRole("alertdialog")).toBeNull();
    await waitFor(() => expect(relationService.setPrivateAccount).toHaveBeenCalledWith(true, "1"));
    expect(privacySwitch()).toHaveAttribute("aria-checked", "true");
  });

  it("shows an error toast and keeps the switch when the write fails", async () => {
    vi.spyOn(relationService, "setPrivateAccount").mockRejectedValue(new Error("boom"));
    useRelationStore.getState().actions.setPrivate("1", false);
    render(<PrivacySettings />);

    await userEvent.click(privacySwitch());

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Không thể cập nhật, thử lại nhé"));
    expect(privacySwitch()).toHaveAttribute("aria-checked", "false");
  });
});

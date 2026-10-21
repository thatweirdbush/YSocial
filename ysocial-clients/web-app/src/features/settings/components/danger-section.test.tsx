import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth";
import { setRealSlices } from "@/test/api-test-utils";
import { DangerSection } from "./danger-section";

const service = vi.hoisted(() => ({ deleteAccount: vi.fn() }));
vi.mock("../services/account-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/account-service")>()),
  deleteAccount: service.deleteAccount,
}));
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  usePathname: () => "/settings/danger",
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const openDialog = () => userEvent.click(screen.getByRole("button", { name: "Xoá tài khoản" }));
const field = () => within(screen.getByRole("alertdialog")).getByLabelText("Nhập tên người dùng để xác nhận");
const confirm = () => userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Xoá vĩnh viễn" }));

beforeEach(() => {
  setRealSlices(undefined);
  service.deleteAccount.mockReset().mockResolvedValue(undefined);
  push.mockClear();
  toast.error.mockClear();
  useAuthStore.setState({ user: { id: "p1", email: "real@ysocial.dev", username: "real_user" }, accessToken: "A", refreshToken: "R", hydrated: true });
});

afterEach(() => useAuthStore.setState({ user: null, accessToken: null, refreshToken: null }));

describe("DangerSection", () => {
  it("is titled 'Danger zone' and offers delete only (no deactivate wording anywhere)", () => {
    render(<DangerSection />);

    expect(screen.getByRole("heading", { level: 1, name: "Vùng nguy hiểm" })).toBeInTheDocument();
    expect(screen.getByText("Hành động này không thể hoàn tác")).toBeInTheDocument();
    expect(screen.queryByText(/vô hiệu|tạm khoá|deactivate/i)).toBeNull();
  });

  it("a different username shows an error, sends nothing and the button stays enabled", async () => {
    render(<DangerSection />);
    await openDialog();

    await userEvent.type(field(), "someone_else");
    await confirm();

    expect(await screen.findByText("Tên người dùng không khớp")).toBeInTheDocument();
    expect(service.deleteAccount).not.toHaveBeenCalled();
    expect(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Xoá vĩnh viễn" })).toBeEnabled();
  });

  it("the matching username deletes the account, clears the session and goes to /login", async () => {
    render(<DangerSection />);
    await openDialog();

    await userEvent.type(field(), "real_user");
    await confirm();

    await waitFor(() => expect(push).toHaveBeenCalledWith("/login"));
    expect(service.deleteAccount).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().refreshToken).toBeNull();
  });

  it("a double click sends one request", async () => {
    let finish: () => void = () => undefined;
    service.deleteAccount.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    render(<DangerSection />);
    await openDialog();
    await userEvent.type(field(), "real_user");

    await userEvent.dblClick(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Xoá vĩnh viễn" }));

    expect(service.deleteAccount).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
  });

  it("a failed delete toasts the error and keeps the session", async () => {
    service.deleteAccount.mockRejectedValue(new Error("boom"));
    render(<DangerSection />);
    await openDialog();
    await userEvent.type(field(), "real_user");

    await confirm();

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Đã có lỗi xảy ra. Vui lòng thử lại!"));
    expect(push).not.toHaveBeenCalled();
    expect(useAuthStore.getState().user).not.toBeNull();
  });

  it("mock mode: shows the unavailable state", () => {
    setRealSlices("");

    render(<DangerSection />);

    expect(screen.getByText("Tính năng này chưa khả dụng")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Xoá tài khoản" })).toBeNull();
  });
});

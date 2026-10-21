import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setRealSlices } from "@/test/api-test-utils";
import type { SessionItem } from "../types";
import { SessionsSection } from "./sessions-section";

const service = vi.hoisted(() => ({ fetchSessions: vi.fn(), revokeSession: vi.fn() }));
vi.mock("../services/account-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/account-service")>()),
  fetchSessions: service.fetchSessions,
  revokeSession: service.revokeSession,
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const CHROME_WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const SAFARI_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

const sessions: SessionItem[] = [
  { id: "s-current", userAgent: CHROME_WIN, profileUsername: "real_user", createdAt: "2026-10-20T08:00:00Z", lastTokenIssuedAt: "2026-10-21T09:00:00Z", isCurrent: true },
  { id: "s-phone", userAgent: SAFARI_IOS, profileUsername: "real_user", createdAt: "2026-10-19T08:00:00Z", lastTokenIssuedAt: "2026-10-20T09:00:00Z", isCurrent: false },
  { id: "s-unknown", userAgent: null, profileUsername: null, createdAt: "2026-10-18T08:00:00Z", lastTokenIssuedAt: "2026-10-18T09:00:00Z", isCurrent: false },
];

const rows = () => screen.getAllByRole("listitem");
const openRevoke = (row: HTMLElement) => userEvent.click(within(row).getByRole("button", { name: "Đăng xuất phiên" }));
const confirm = () => userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Đăng xuất phiên" }));

beforeEach(() => {
  setRealSlices(undefined);
  service.fetchSessions.mockReset().mockResolvedValue(sessions);
  service.revokeSession.mockReset().mockResolvedValue(undefined);
  toast.success.mockClear();
  toast.error.mockClear();
});

describe("SessionsSection", () => {
  it("lists devices: the current one has a badge and no revoke button, the others can be revoked", async () => {
    render(<SessionsSection />);
    await screen.findByText("Chrome · Windows");

    expect(rows()).toHaveLength(3);
    expect(within(rows()[0]).getByText("Thiết bị này")).toBeInTheDocument();
    expect(within(rows()[0]).queryByRole("button")).toBeNull();
    expect(within(rows()[1]).getByText("Safari · iOS")).toBeInTheDocument();
    expect(within(rows()[1]).getByRole("button", { name: "Đăng xuất phiên" })).toBeInTheDocument();
    expect(within(rows()[2]).getByText("Thiết bị không xác định")).toBeInTheDocument();
  });

  it("labels the two timestamps for what they are (sign-in & last token issue, never 'active')", async () => {
    render(<SessionsSection />);
    await screen.findByText("Chrome · Windows");

    expect(within(rows()[0]).getByText(/Đăng nhập lúc/)).toBeInTheDocument();
    expect(within(rows()[0]).getByText(/Cấp token lần cuối/)).toBeInTheDocument();
    expect(screen.queryByText(/hoạt động/i)).toBeNull();
  });

  it("asks first, states the access-token delay, then revokes & drops the row", async () => {
    render(<SessionsSection />);
    await screen.findByText("Chrome · Windows");

    await openRevoke(rows()[1]);
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Đăng xuất phiên này?");
    expect(screen.getByRole("alertdialog")).toHaveTextContent("tối đa 15 phút");
    expect(service.revokeSession).not.toHaveBeenCalled();
    await confirm();

    await waitFor(() => expect(service.revokeSession).toHaveBeenCalledWith("s-phone"));
    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(screen.queryByText("Safari · iOS")).toBeNull();
  });

  it("a double click on confirm sends one request", async () => {
    let finish: () => void = () => undefined;
    service.revokeSession.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    render(<SessionsSection />);
    await screen.findByText("Chrome · Windows");
    await openRevoke(rows()[1]);

    const button = within(screen.getByRole("alertdialog")).getByRole("button", { name: "Đăng xuất phiên" });
    await userEvent.dblClick(button);

    expect(service.revokeSession).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    await waitFor(() => expect(rows()).toHaveLength(2));
  });

  it("a failed revoke toasts the error and keeps the row", async () => {
    service.revokeSession.mockRejectedValue(new Error("boom"));
    render(<SessionsSection />);
    await screen.findByText("Chrome · Windows");
    await openRevoke(rows()[2]);

    await confirm();

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Đã có lỗi xảy ra. Vui lòng thử lại!"));
    expect(rows()).toHaveLength(3);
  });

  it("offers a retry when the list cannot be loaded", async () => {
    service.fetchSessions.mockRejectedValueOnce(new Error("offline"));
    render(<SessionsSection />);

    await userEvent.click(await screen.findByRole("button", { name: "Thử lại" }));

    expect(await screen.findByText("Chrome · Windows")).toBeInTheDocument();
  });

  it("mock mode: shows the unavailable state & makes no request", () => {
    setRealSlices("");

    render(<SessionsSection />);

    expect(screen.getByText("Tính năng này chưa khả dụng")).toBeInTheDocument();
    expect(service.fetchSessions).not.toHaveBeenCalled();
  });
});

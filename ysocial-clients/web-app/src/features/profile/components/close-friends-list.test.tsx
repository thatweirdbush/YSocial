import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth";
import { resetPostStore } from "@/features/posts/store/post-store";
import { __resetBlockGraph } from "@/mocks/block-graph";
import { __resetPrivacy } from "@/mocks/privacy";
import { __resetRelationGraph, getCloseFriendIds } from "@/mocks/relation-graph";
import * as relationService from "../services/relation-service";
import * as userService from "../services/user-service";
import { resetOpLedger } from "../store/op-ledger";
import { ensureRelationSets, resetRelationStore } from "../store/relation-store";
import { resetUserStore } from "../store/user-store";
import { CloseFriendsList } from "./close-friends-list";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

const WAIT = { timeout: 3000 };
const row = (name: string) => screen.getByText(name).closest("li") as HTMLElement;

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

describe("CloseFriendsList", () => {
  it("lists accepted followees with the close friend already pressed and a count header", async () => {
    render(<CloseFriendsList />);

    expect(await screen.findByText("Trần Anh Quốc", {}, WAIT)).toBeInTheDocument();
    expect(screen.getByText("Elena Vance")).toBeInTheDocument();
    expect(await screen.findByText("1 bạn thân", {}, WAIT)).toBeInTheDocument();
    expect(within(row("Trần Anh Quốc")).getByRole("button", { name: "Xoá" })).toHaveAttribute("aria-pressed", "true");
    expect(within(row("Elena Vance")).getByRole("button", { name: "Thêm" })).toHaveAttribute("aria-pressed", "false");
  });

  it("toggles a row through the service and updates the count", async () => {
    render(<CloseFriendsList />);
    await screen.findByText("Elena Vance", {}, WAIT);
    // The count needs the accepted-follow graph (loaded separately from the list): wait for the baseline first
    await screen.findByText("1 bạn thân", {}, WAIT);

    await userEvent.click(within(row("Elena Vance")).getByRole("button", { name: "Thêm" }));

    expect(within(row("Elena Vance")).getByRole("button", { name: "Xoá" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("2 bạn thân")).toBeInTheDocument();
    await waitFor(() => expect(getCloseFriendIds("1")).toContain("author-02"), WAIT);

    await userEvent.click(within(row("Trần Anh Quốc")).getByRole("button", { name: "Xoá" }));

    expect(screen.getByText("1 bạn thân")).toBeInTheDocument();
    await waitFor(() => expect(getCloseFriendIds("1")).not.toContain("author-03"), WAIT);
  });

  it("rolls the toggle back with an error toast when the write fails", async () => {
    vi.spyOn(relationService, "setCloseFriend").mockRejectedValue(new Error("boom"));
    render(<CloseFriendsList />);
    await screen.findByText("Elena Vance", {}, WAIT);

    await userEvent.click(within(row("Elena Vance")).getByRole("button", { name: "Thêm" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Không thể cập nhật, thử lại nhé"));
    expect(within(row("Elena Vance")).getByRole("button", { name: "Thêm" })).toHaveAttribute("aria-pressed", "false");
    expect(await screen.findByText("1 bạn thân", {}, WAIT)).toBeInTheDocument();
  });

  it("shows the empty state when the viewer follows nobody", async () => {
    vi.spyOn(relationService, "fetchCloseFriendCandidates").mockResolvedValue({ users: [] });
    render(<CloseFriendsList />);

    expect(await screen.findByText("Chưa có ai để thêm")).toBeInTheDocument();
    expect(screen.getByText("Hãy theo dõi vài người rồi thêm họ vào bạn thân.")).toBeInTheDocument();
  });
});

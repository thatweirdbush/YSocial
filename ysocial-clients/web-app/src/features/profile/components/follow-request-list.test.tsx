import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth";
import { resetPostStore } from "@/features/posts/store/post-store";
import { __resetBlockGraph } from "@/mocks/block-graph";
import { __resetPrivacy } from "@/mocks/privacy";
import { __resetRelationGraph, getFollowStatus } from "@/mocks/relation-graph";
import * as relationService from "../services/relation-service";
import * as userService from "../services/user-service";
import { resetOpLedger } from "../store/op-ledger";
import { commitPrivacy, ensureRelationSets, resetRelationStore, useRelationStore } from "../store/relation-store";
import { resetUserStore } from "../store/user-store";
import { FollowRequestList } from "./follow-request-list";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

const WAIT = { timeout: 3000 };
const count = () => useRelationStore.getState().byViewer["1"]?.requestCount;

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

describe("FollowRequestList", () => {
  it("lists the demo account's 4 pending requests under a titled section", async () => {
    render(<FollowRequestList />);

    expect(await screen.findByText("Elena Vance", {}, WAIT)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Yêu cầu theo dõi" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Xác nhận" })).toHaveLength(4);
    expect(screen.getAllByRole("button", { name: "Xoá" })).toHaveLength(4);
    expect(count()).toBe(4);
  });

  it("confirms a request: row gone, requester accepted, count 3, no list reload", async () => {
    const fetchRequests = vi.spyOn(relationService, "fetchFollowRequests");
    render(<FollowRequestList />);
    await screen.findByText("Elena Vance", {}, WAIT);
    expect(fetchRequests).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getAllByRole("button", { name: "Xác nhận" })[0]);

    await waitFor(() => expect(screen.getAllByRole("button", { name: "Xác nhận" })).toHaveLength(3), WAIT);
    await waitFor(() => expect(count()).toBe(3), WAIT);
    expect(getFollowStatus("author-02", "1")).not.toBe("none");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(fetchRequests).toHaveBeenCalledTimes(1);
  });

  it("deletes a request without a follow", async () => {
    const respond = vi.spyOn(relationService, "respondFollowRequest");
    render(<FollowRequestList />);
    await screen.findByText("Elena Vance", {}, WAIT);

    await userEvent.click(screen.getAllByRole("button", { name: "Xoá" })[0]);

    await waitFor(() => expect(respond).toHaveBeenCalledWith(expect.any(String), "decline", "1"), WAIT);
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Xoá" })).toHaveLength(3), WAIT);
    const requesterId = respond.mock.calls[0][0];
    expect(getFollowStatus(requesterId, "1")).toBe("none");
  });

  it("restores the row and shows an error toast when the response fails", async () => {
    vi.spyOn(relationService, "respondFollowRequest").mockRejectedValue(new Error("boom"));
    render(<FollowRequestList />);
    await screen.findByText("Elena Vance", {}, WAIT);

    await userEvent.click(screen.getAllByRole("button", { name: "Xác nhận" })[0]);

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Không thể cập nhật, thử lại nhé"));
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Xác nhận" })).toHaveLength(4), WAIT);
    expect(count()).toBe(4);
  });

  it("reloads the first page when the requests change from outside (going public)", async () => {
    render(<FollowRequestList />);
    await screen.findByText("Elena Vance", {}, WAIT);

    await commitPrivacy("1", false);

    expect(await screen.findByText("Không có yêu cầu nào", {}, WAIT)).toBeInTheDocument();
  });

  it("shows the empty state when there are no requests", async () => {
    vi.spyOn(relationService, "fetchFollowRequests").mockResolvedValue({ users: [] });
    render(<FollowRequestList />);

    expect(await screen.findByText("Không có yêu cầu nào")).toBeInTheDocument();
    expect(screen.getByText("Khi có người muốn theo dõi bạn, yêu cầu sẽ hiện ở đây.")).toBeInTheDocument();
  });
});

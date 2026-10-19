import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth";
import { setRealSlices } from "@/test/api-test-utils";
import * as service from "../services/notification-service";
import { resetNotificationStore } from "../store/notification-store";
import type { NotificationItemData, NotificationPage } from "../types";
import { NotificationContainer } from "./notification-container";

vi.mock("@/features/profile", () => ({ FollowRequestsBanner: () => null }));
vi.mock("next/navigation", () => ({ usePathname: () => "/notifications", useRouter: () => ({ push: vi.fn() }) }));

const item = (id: string, overrides: Partial<NotificationItemData> = {}): NotificationItemData => ({
  id,
  kind: "like",
  user: { id: "u1", username: "sender", displayName: "Sender Name" },
  createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  isRead: false,
  postId: "p-1",
  ...overrides,
});
const page = (items: NotificationItemData[], overrides: Partial<NotificationPage> = {}): NotificationPage => ({
  items,
  unreadCount: items.filter((entry) => !entry.isRead).length,
  ...overrides,
});

beforeEach(() => {
  resetNotificationStore();
  useAuthStore.setState({ isAuthenticated: true });
});
afterEach(() => {
  vi.restoreAllMocks();
  useAuthStore.setState({ isAuthenticated: false });
});

describe("mock mode", () => {
  it("shows the seed notifications with their display timestamps", async () => {
    setRealSlices(undefined);
    render(<NotificationContainer />);
    expect(await screen.findAllByText("Nguyễn Hà My")).not.toHaveLength(0);
    expect(screen.getAllByText("10m ago")).not.toHaveLength(0);
  });
});

describe("real mode", () => {
  beforeEach(() => setRealSlices("auth,content,graph,activity"));

  it("renders BE items with relative time, follow wording per type & profile link", async () => {
    vi.spyOn(service, "fetchNotifications").mockResolvedValue(
      page([
        item("a"),
        item("b", { kind: "follow", type: "FollowRequested", postId: undefined }),
        item("c", { kind: "follow", type: "FollowAccepted", postId: undefined }),
        item("d", { kind: "other", message: "Something happened", postId: undefined }),
      ]),
    );
    render(<NotificationContainer />);

    expect(await screen.findByText("đã thích bài viết của bạn")).toBeInTheDocument();
    expect(screen.getAllByText("5 phút trước")).not.toHaveLength(0);
    expect(screen.getByText("đã gửi yêu cầu theo dõi bạn")).toBeInTheDocument();
    expect(screen.getByText("đã chấp nhận yêu cầu theo dõi của bạn")).toBeInTheDocument();
    expect(screen.getByText("Something happened")).toBeInTheDocument();
    const links = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(links).toContain("/posts/p-1");
    expect(links).toContain("/@sender");
  });

  it("real follow items have no follow-back button", async () => {
    vi.spyOn(service, "fetchNotifications").mockResolvedValue(page([item("b", { kind: "follow", type: "NewFollow", postId: undefined })]));
    render(<NotificationContainer />);
    await screen.findByText("đã bắt đầu theo dõi bạn");
    expect(screen.queryByRole("button", { name: /Theo dõi|Đang theo dõi/ })).toBeNull();
  });

  it("opening an unread item marks it read through the service", async () => {
    vi.spyOn(service, "fetchNotifications").mockResolvedValue(page([item("a")]));
    const mark = vi.spyOn(service, "markNotificationRead").mockResolvedValue();
    render(<NotificationContainer />);
    await userEvent.click(await screen.findByRole("link", { name: /Sender Name/ }));
    expect(mark).toHaveBeenCalledWith("a");
  });

  it("mark all read button calls the service & disappears", async () => {
    vi.spyOn(service, "fetchNotifications").mockResolvedValue(page([item("a"), item("b")]));
    const markAll = vi.spyOn(service, "markAllNotificationsRead").mockResolvedValue();
    render(<NotificationContainer />);
    await userEvent.click(await screen.findByRole("button", { name: "Đánh dấu đã đọc tất cả" }));
    expect(markAll).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Đánh dấu đã đọc tất cả" })).toBeNull());
  });

  it("load more appends the next page", async () => {
    vi.spyOn(service, "fetchNotifications")
      .mockResolvedValueOnce(page([item("a")], { nextPage: 2 }))
      .mockResolvedValueOnce(page([item("b", { user: { id: "u2", username: "second", displayName: "Second One" } })]));
    render(<NotificationContainer />);
    await userEvent.click(await screen.findByRole("button", { name: "Xem thêm" }));
    expect(await screen.findByText("Second One")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Xem thêm" })).toBeNull();
  });

  it("load failure shows an error with retry (not the empty state)", async () => {
    const fetch = vi.spyOn(service, "fetchNotifications").mockRejectedValueOnce(new Error("down")).mockResolvedValue(page([item("a")]));
    render(<NotificationContainer />);
    expect(await screen.findByText("Không tải được thông báo")).toBeInTheDocument();
    expect(screen.queryByText("Bạn đã đọc hết! Chưa có thông báo mới.")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("đã thích bài viết của bạn")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth";
import { setRealSlices } from "@/test/api-test-utils";
import * as service from "../services/notification-service";
import { pushNotification, resetNotificationStore, useNotificationStore } from "../store/notification-store";
import type { NotificationItemData, NotificationPage } from "../types";
import { NotificationContainer } from "./notification-container";

vi.mock("@/features/profile", () => ({ FollowRequestsBanner: () => null }));
vi.mock("next/navigation", () => ({ usePathname: () => "/notifications", useRouter: () => ({ push: vi.fn() }) }));

const minutesAgo = (minutes: number): string => new Date(Date.now() - minutes * 60_000).toISOString();
const item = (id: string, overrides: Partial<NotificationItemData> = {}): NotificationItemData => ({
  id,
  kind: "like",
  user: { id: "u1", username: "sender", displayName: "Sender Name" },
  createdAt: minutesAgo(5),
  isRead: false,
  postId: "p-1",
  ...overrides,
});
const page = (items: NotificationItemData[], overrides: Partial<NotificationPage> = {}): NotificationPage => ({
  items,
  unreadCount: items.filter((entry) => !entry.isRead).length,
  ...overrides,
});
const readItem = (id: string, overrides: Partial<NotificationItemData> = {}) => item(id, { isRead: true, ...overrides });

let visibility: DocumentVisibilityState = "visible";
const setVisibility = (next: DocumentVisibilityState) => {
  visibility = next;
  document.dispatchEvent(new Event("visibilitychange"));
};

beforeEach(() => {
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
  resetNotificationStore();
  useAuthStore.setState({ isAuthenticated: true });
  vi.spyOn(service, "fetchUnreadCount").mockResolvedValue(0);
});
afterEach(() => {
  vi.restoreAllMocks();
  useAuthStore.setState({ isAuthenticated: false });
  service.resetMockNotificationState();
});

describe("mock mode", () => {
  beforeEach(() => setRealSlices("none"));

  it("shows the seed notifications with relative times, mentions tab included", async () => {
    render(<NotificationContainer />);
    expect(await screen.findAllByText("Nguyễn Hà My")).not.toHaveLength(0);
    expect(screen.getAllByText("10 phút trước")).not.toHaveLength(0);
    expect(screen.getByRole("tab", { name: "Nhắc đến" })).toBeInTheDocument();
  });

  it("the mentions tab lists the mention seed items only", async () => {
    render(<NotificationContainer />);
    await userEvent.click(await screen.findByRole("tab", { name: "Nhắc đến" }));
    expect(await screen.findAllByText("đã nhắc đến bạn")).toHaveLength(2);
    expect(screen.queryByText("đã thích bài viết của bạn")).toBeNull();
  });

  it("the seed likes of one post collapse into a group row", async () => {
    render(<NotificationContainer />);
    expect(await screen.findByText("Phan Văn Minh và 1 người khác đã thích bài viết của bạn")).toBeInTheDocument();
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
    vi.spyOn(service, "markAllNotificationsRead").mockResolvedValue();
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
    vi.spyOn(service, "fetchNotifications").mockResolvedValue(page([readItem("b", { kind: "follow", type: "NewFollow", postId: undefined })]));
    render(<NotificationContainer />);
    await screen.findByText("đã bắt đầu theo dõi bạn");
    expect(screen.queryByRole("button", { name: /Theo dõi|Đang theo dõi/ })).toBeNull();
  });

  it("offers no mentions tab (the BE has no mention model)", async () => {
    vi.spyOn(service, "fetchNotifications").mockResolvedValue(page([]));
    render(<NotificationContainer />);
    await screen.findByText("Bạn đã đọc hết! Chưa có thông báo mới.");
    expect(screen.queryByRole("tab", { name: "Nhắc đến" })).toBeNull();
    expect(screen.getAllByRole("tab")).toHaveLength(4);
  });

  describe("tabs", () => {
    it("a tab loads its own server-filtered list, with its own paging & empty state", async () => {
      const spy = vi.spyOn(service, "fetchNotifications").mockImplementation(async (_page, filter = "all") =>
        filter === "likes" ? page([readItem("l1", { user: { id: "u9", username: "liker", displayName: "Liker Nine" } })]) : page([readItem("r1", { kind: "reply" })]),
      );
      render(<NotificationContainer />);
      await screen.findByText("đã trả lời bài viết của bạn");
      await userEvent.click(screen.getByRole("tab", { name: "Thả tim" }));
      expect(await screen.findByText("Liker Nine")).toBeInTheDocument();
      expect(spy).toHaveBeenCalledWith(1, "likes");
      expect(screen.queryByText("đã trả lời bài viết của bạn")).toBeNull();
    });

    it("an empty tab shows its own message", async () => {
      vi.spyOn(service, "fetchNotifications").mockImplementation(async (_page, filter = "all") => (filter === "follows" ? page([]) : page([readItem("a")])));
      render(<NotificationContainer />);
      await screen.findByText("đã thích bài viết của bạn");
      await userEvent.click(screen.getByRole("tab", { name: "Theo dõi" }));
      expect(await screen.findByText("Chưa có người theo dõi mới.")).toBeInTheDocument();
    });

    it("load more appends in the active tab only", async () => {
      vi.spyOn(service, "fetchNotifications")
        .mockResolvedValueOnce(page([readItem("a")], { nextPage: 2 }))
        .mockResolvedValueOnce(page([readItem("b", { user: { id: "u2", username: "second", displayName: "Second One" }, postId: "p-2" })]));
      render(<NotificationContainer />);
      await userEvent.click(await screen.findByRole("button", { name: "Xem thêm" }));
      expect(await screen.findByText("Second One")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Xem thêm" })).toBeNull();
    });

    it("shows a skeleton while the first page loads & an error with retry (not the empty state) on failure", async () => {
      const fetch = vi.spyOn(service, "fetchNotifications").mockRejectedValueOnce(new Error("down")).mockResolvedValue(page([readItem("a")]));
      render(<NotificationContainer />);
      expect(await screen.findByText("Không tải được thông báo")).toBeInTheDocument();
      expect(screen.queryByText("Bạn đã đọc hết! Chưa có thông báo mới.")).toBeNull();
      await userEvent.click(screen.getByRole("button", { name: "Thử lại" }));
      expect(await screen.findByText("đã thích bài viết của bạn")).toBeInTheDocument();
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("likes grouping", () => {
    it("collapses likes of one post into 'X and N others' with the exact loaded count", async () => {
      vi.spyOn(service, "fetchNotifications").mockResolvedValue(
        page([
          readItem("a", { createdAt: minutesAgo(1), user: { id: "u1", username: "one", displayName: "One" } }),
          readItem("b", { createdAt: minutesAgo(2), user: { id: "u2", username: "two", displayName: "Two" } }),
          readItem("c", { createdAt: minutesAgo(3), user: { id: "u3", username: "three", displayName: "Three" } }),
        ]),
      );
      render(<NotificationContainer />);
      expect(await screen.findByText("One và 2 người khác đã thích bài viết của bạn")).toBeInTheDocument();
      expect(screen.getAllByRole("link")).toHaveLength(1);
    });

    it("regroups when a push arrives for the same post, never when it is for another post", async () => {
      vi.spyOn(service, "fetchNotifications").mockResolvedValue(
        page([
          readItem("a", { createdAt: minutesAgo(2), user: { id: "u1", username: "one", displayName: "One" } }),
          readItem("b", { createdAt: minutesAgo(3), user: { id: "u2", username: "two", displayName: "Two" } }),
        ]),
      );
      render(<NotificationContainer />);
      await screen.findByText("One và 1 người khác đã thích bài viết của bạn");
      pushNotification(item("live", { isRead: true, createdAt: minutesAgo(0), user: { id: "u3", username: "three", displayName: "Three" } }));
      expect(await screen.findByText("Three và 2 người khác đã thích bài viết của bạn")).toBeInTheDocument();
      pushNotification(item("other", { isRead: true, createdAt: minutesAgo(0), postId: "p-9", user: { id: "u4", username: "four", displayName: "Four" } }));
      expect(await screen.findByText("Four")).toBeInTheDocument();
    });

    it("opening a group marks every unread member read", async () => {
      vi.spyOn(service, "fetchNotifications").mockResolvedValue(
        page([
          item("a", { createdAt: minutesAgo(1), user: { id: "u1", username: "one", displayName: "One" } }),
          item("b", { createdAt: minutesAgo(2), user: { id: "u2", username: "two", displayName: "Two" } }),
        ]),
      );
      // The auto mark-on-view must not race this test: keep the tab hidden
      visibility = "hidden";
      const mark = vi.spyOn(service, "markNotificationRead").mockResolvedValue();
      render(<NotificationContainer />);
      await userEvent.click(await screen.findByRole("link", { name: /One và 1 người khác/ }));
      expect(mark.mock.calls.map(([id]) => id).sort()).toEqual(["a", "b"]);
    });
  });

  describe("mark on view", () => {
    it("marks what is on screen read once, bounded by the newest loaded id, and keeps the 'new' highlight for the visit", async () => {
      vi.spyOn(service, "fetchNotifications").mockResolvedValue(
        page([
          item("a", { createdAt: minutesAgo(1), kind: "reply" }),
          item("b", { createdAt: minutesAgo(2), kind: "follow", type: "NewFollow", postId: undefined }),
        ]),
      );
      const markAll = vi.spyOn(service, "markAllNotificationsRead").mockResolvedValue();
      render(<NotificationContainer />);

      await waitFor(() => expect(markAll).toHaveBeenCalledWith("a"));
      expect(markAll).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(useNotificationStore.getState().unreadCount).toBe(0));
      expect(screen.getAllByRole("img", { name: "Chưa đọc" })).toHaveLength(2);
      expect(screen.queryByRole("button", { name: "Đánh dấu đã đọc tất cả" })).toBeNull();
    });

    it("StrictMode double effect still sends ONE request and keeps the highlight", async () => {
      vi.spyOn(service, "fetchNotifications").mockResolvedValue(page([item("a", { kind: "reply" })]));
      const markAll = vi.spyOn(service, "markAllNotificationsRead").mockResolvedValue();
      render(
        <StrictMode>
          <NotificationContainer />
        </StrictMode>,
      );
      await waitFor(() => expect(markAll).toHaveBeenCalled());
      await waitFor(() => expect(useNotificationStore.getState().byId.a.isRead).toBe(true));
      expect(markAll).toHaveBeenCalledTimes(1);
      expect(screen.getAllByRole("img", { name: "Chưa đọc" })).toHaveLength(1);
    });

    it("a hidden tab marks nothing; a push stays unread until the tab is shown again, then it is bounded by the new newest id", async () => {
      vi.spyOn(service, "fetchNotifications").mockResolvedValue(page([readItem("a", { kind: "reply" })]));
      const markAll = vi.spyOn(service, "markAllNotificationsRead").mockResolvedValue();
      visibility = "hidden";
      render(<NotificationContainer />);
      await screen.findByText("đã trả lời bài viết của bạn");
      pushNotification(item("live", { kind: "reply", createdAt: minutesAgo(0) }));
      await Promise.resolve();
      expect(markAll).not.toHaveBeenCalled();
      expect(useNotificationStore.getState().byId.live.isRead).toBe(false);

      setVisibility("visible");
      await waitFor(() => expect(markAll).toHaveBeenCalledWith("live"));
    });

    it("a push that lands while the page is open is read at once (and still highlighted)", async () => {
      vi.spyOn(service, "fetchNotifications").mockResolvedValue(page([readItem("a", { kind: "reply" })]));
      const markAll = vi.spyOn(service, "markAllNotificationsRead").mockResolvedValue();
      render(<NotificationContainer />);
      await screen.findByText("đã trả lời bài viết của bạn");
      pushNotification(item("live", { kind: "reply", createdAt: minutesAgo(0), user: { id: "u5", username: "five", displayName: "Five" } }));
      await waitFor(() => expect(markAll).toHaveBeenCalledWith("live"));
      expect(screen.getAllByRole("img", { name: "Chưa đọc" })).toHaveLength(1);
    });

    it("a failed auto mark-all does not loop; the button stays for a manual retry", async () => {
      vi.spyOn(service, "fetchNotifications").mockResolvedValue(page([item("a", { kind: "reply" })]));
      const markAll = vi.spyOn(service, "markAllNotificationsRead").mockRejectedValueOnce(new Error("500")).mockResolvedValue();
      vi.spyOn(service, "fetchUnreadCount").mockResolvedValue(1);
      render(<NotificationContainer />);
      const button = await screen.findByRole("button", { name: "Đánh dấu đã đọc tất cả" });
      await waitFor(() => expect(markAll).toHaveBeenCalledTimes(1));
      await Promise.resolve();
      expect(markAll).toHaveBeenCalledTimes(1);
      await userEvent.click(button);
      expect(markAll).toHaveBeenCalledTimes(2);
    });

    it("signed-out: no request at all", async () => {
      useAuthStore.setState({ isAuthenticated: false });
      const markAll = vi.spyOn(service, "markAllNotificationsRead").mockResolvedValue();
      render(<NotificationContainer />);
      await screen.findByText("Bạn đã đọc hết! Chưa có thông báo mới.");
      expect(markAll).not.toHaveBeenCalled();
    });
  });

  it("opening an unread item marks it read through the service", async () => {
    vi.spyOn(service, "fetchNotifications").mockResolvedValue(page([item("a")]));
    visibility = "hidden";
    const mark = vi.spyOn(service, "markNotificationRead").mockResolvedValue();
    render(<NotificationContainer />);
    await userEvent.click(await screen.findByRole("link", { name: /Sender Name/ }));
    expect(mark).toHaveBeenCalledWith("a");
    expect(within(screen.getByRole("tablist")).getAllByRole("tab")).toHaveLength(4);
  });
});

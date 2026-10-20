import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth";
import * as service from "@/features/notifications/services/notification-service";
import { resetPreferencesStore } from "@/features/notifications/store/notification-preferences-store";
import type { NotificationPreferences } from "@/features/notifications";
import { setRealSlices } from "@/test/api-test-utils";
import { NotificationSettings } from "./notification-settings";
import { NotificationsSection } from "./settings-sections";

const ON: NotificationPreferences = { likes: true, replies: true, follows: true };
const switchOf = (name: RegExp) => screen.getByRole("switch", { name });
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

beforeEach(() => {
  resetPreferencesStore();
  setRealSlices("auth,content,graph,activity");
  useAuthStore.setState({ user: { id: "viewer-1", email: "v@x.dev" }, isAuthenticated: true });
});
afterEach(() => {
  vi.restoreAllMocks();
  useAuthStore.setState({ user: null, isAuthenticated: false });
});

describe("NotificationsSection capability", () => {
  it("is unavailable while content is real & activity still mock (switches would write to a mock only)", () => {
    setRealSlices("auth,content,graph");
    render(<NotificationsSection />);
    expect(screen.getByText("Tính năng này chưa khả dụng")).toBeInTheDocument();
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("is available with every slice real and in mock mode", async () => {
    vi.spyOn(service, "fetchNotificationPreferences").mockResolvedValue(ON);
    setRealSlices("none");
    const { unmount } = render(<NotificationsSection />);
    expect(await screen.findByRole("switch", { name: "Lượt thích" })).toBeInTheDocument();
    unmount();
    setRealSlices("auth,content,graph,activity");
    render(<NotificationsSection />);
    expect(await screen.findByRole("switch", { name: "Lượt thích" })).toBeInTheDocument();
  });
});

describe("NotificationSettings", () => {
  it("shows a skeleton and NO switch until the preferences are loaded", async () => {
    const load = deferred<NotificationPreferences>();
    vi.spyOn(service, "fetchNotificationPreferences").mockReturnValue(load.promise);
    render(<NotificationSettings />);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByRole("switch")).toBeNull();

    load.resolve({ likes: true, replies: false, follows: true });
    expect(await screen.findByRole("switch", { name: "Lượt thích" })).toBeChecked();
    expect(switchOf(/Trả lời/)).not.toBeChecked();
    expect(switchOf(/Theo dõi/)).toBeChecked();
  });

  it("load failure shows an error with retry", async () => {
    const fetch = vi.spyOn(service, "fetchNotificationPreferences").mockRejectedValueOnce(new Error("down")).mockResolvedValue(ON);
    render(<NotificationSettings />);
    expect(await screen.findByText("Không tải được thông báo")).toBeInTheDocument();
    expect(screen.queryByRole("switch")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByRole("switch", { name: "Lượt thích" })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("toggles optimistically & saves the full object", async () => {
    vi.spyOn(service, "fetchNotificationPreferences").mockResolvedValue(ON);
    const save = vi.spyOn(service, "saveNotificationPreferences").mockImplementation(async (preferences) => preferences);
    render(<NotificationSettings />);
    await userEvent.click(await screen.findByRole("switch", { name: "Lượt thích" }));
    expect(switchOf(/Lượt thích/)).not.toBeChecked();
    await waitFor(() => expect(save).toHaveBeenCalledWith({ likes: false, replies: true, follows: true }));
  });

  it("a rejected save reverts the switch and tells the user", async () => {
    vi.spyOn(service, "fetchNotificationPreferences").mockResolvedValue(ON);
    vi.spyOn(service, "saveNotificationPreferences").mockRejectedValue(new Error("500"));
    render(<NotificationSettings />);
    await userEvent.click(await screen.findByRole("switch", { name: "Trả lời" }));
    await waitFor(() => expect(switchOf(/Trả lời/)).toBeChecked());
  });

  it("A off, A on, B off while the first save fails: the screen ends on the latest choices", async () => {
    vi.spyOn(service, "fetchNotificationPreferences").mockResolvedValue(ON);
    const first = deferred<NotificationPreferences>();
    const save = vi
      .spyOn(service, "saveNotificationPreferences")
      .mockReturnValueOnce(first.promise)
      .mockImplementation(async (preferences) => preferences);
    render(<NotificationSettings />);
    await screen.findByRole("switch", { name: "Lượt thích" });

    await userEvent.click(switchOf(/Lượt thích/));
    await userEvent.click(switchOf(/Lượt thích/));
    await userEvent.click(switchOf(/Theo dõi/));
    first.reject(new Error("500"));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save).toHaveBeenLastCalledWith({ likes: true, replies: true, follows: false });
    expect(switchOf(/Lượt thích/)).toBeChecked();
    expect(switchOf(/Theo dõi/)).not.toBeChecked();
  });

  it("states what likes and replies cover", async () => {
    vi.spyOn(service, "fetchNotificationPreferences").mockResolvedValue(ON);
    render(<NotificationSettings />);
    expect(await screen.findByText("Lượt thích bài viết và bình luận của bạn.")).toBeInTheDocument();
    expect(screen.getByText("Trả lời bài viết của bạn.")).toBeInTheDocument();
  });
});

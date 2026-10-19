import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAuthStore } from "@/features/auth";
import { makeUserProfile } from "../mocks/user-fixtures";
import * as userService from "../services/user-service";
import { resetUserStore, useUserStore } from "../store/user-store";
import type { FollowListPage, UserProfile } from "../types";
import { FollowersDialog } from "./followers-dialog";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh }),
}));

const makeUser = (id: string, overrides: Partial<UserProfile> = {}): UserProfile =>
  makeUserProfile({ id, displayName: `User ${id}`, username: `user.${id}`, followersCount: 5, followingCount: 5, ...overrides });

const pageOf = (ids: string[], nextPage?: number): FollowListPage => ({ users: ids.map((id) => makeUser(id)), nextPage });
const idsRange = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `u${from + i}`);

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

type ObserverCallback = (entries: Array<{ isIntersecting: boolean }>) => void;
const observers: ObserverCallback[] = [];
const intersectAll = () => observers.forEach((callback) => callback([{ isIntersecting: true }]));

const rows = () => screen.getAllByRole("listitem");

function renderDialog(overrides: Partial<React.ComponentProps<typeof FollowersDialog>> = {}) {
  const onOpenChange = vi.fn();
  render(<FollowersDialog open onOpenChange={onOpenChange} userId="author-01" username="antigravity.core" initialKind="followers" {...overrides} />);
  return { onOpenChange };
}

beforeEach(() => {
  vi.restoreAllMocks();
  resetUserStore();
  observers.length = 0;
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: ObserverCallback) {
        observers.push(callback);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    },
  );
  useAuthStore.setState({ user: null, hydrated: true });
  vi.spyOn(userService, "fetchUser").mockResolvedValue(null);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("FollowersDialog", () => {
  it("lists followers from the service and loads the next page when the sentinel intersects", async () => {
    const spy = vi
      .spyOn(userService, "fetchFollowList")
      .mockImplementation(async (_id, _kind, { page }) => (page === 2 ? pageOf(["u21"]) : pageOf(idsRange(1, 20), 2)));
    renderDialog();

    await waitFor(() => expect(rows()).toHaveLength(20));
    expect(spy).toHaveBeenCalledWith("author-01", "followers", expect.objectContaining({ page: 1 }), "me");

    act(() => intersectAll());

    await waitFor(() => expect(rows()).toHaveLength(21));
    expect(spy).toHaveBeenCalledWith("author-01", "followers", expect.objectContaining({ page: 2 }), "me");
  });

  it("switches to the following list", async () => {
    const spy = vi.spyOn(userService, "fetchFollowList").mockImplementation(async (_id, kind) => pageOf(kind === "followers" ? ["f1"] : ["g1", "g2"]));
    renderDialog();
    await waitFor(() => expect(rows()).toHaveLength(1));

    await userEvent.click(screen.getByRole("tab", { name: /Đang theo dõi/ }));

    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(spy).toHaveBeenCalledWith("author-01", "following", expect.objectContaining({ page: 1 }), "me");
  });

  it("starts on the requested kind", async () => {
    const spy = vi.spyOn(userService, "fetchFollowList").mockResolvedValue(pageOf(["g1"]));
    renderDialog({ initialKind: "following" });

    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(spy).toHaveBeenCalledWith("author-01", "following", expect.anything(), "me");
    expect(screen.getByRole("tab", { name: /Đang theo dõi/ })).toHaveAttribute("aria-selected", "true");
  });

  it("debounces the search, resets to page 1 and ignores an older in-flight response", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const first = deferred<FollowListPage>();
    const spy = vi.spyOn(userService, "fetchFollowList").mockImplementation((_id, _kind, { query }) =>
      query ? Promise.resolve(pageOf(["match1"])) : first.promise,
    );
    renderDialog();

    await user.type(screen.getByRole("searchbox"), "linh");
    expect(spy).not.toHaveBeenCalledWith("author-01", "followers", expect.objectContaining({ query: "linh" }), "me");
    await act(() => vi.advanceTimersByTimeAsync(260));

    await waitFor(() => expect(spy).toHaveBeenCalledWith("author-01", "followers", { query: "linh", page: 1 }, "me"));
    await waitFor(() => expect(rows()).toHaveLength(1));

    await act(async () => first.resolve(pageOf(["stale1", "stale2", "stale3"])));

    expect(rows()).toHaveLength(1);
    expect(screen.queryByText("User stale1")).toBeNull();
  });

  it("explains an empty search result", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.spyOn(userService, "fetchFollowList").mockImplementation(async (_id, _kind, { query }) => (query ? { users: [] } : pageOf(["u1"])));
    renderDialog();
    await waitFor(() => expect(rows()).toHaveLength(1));

    await user.type(screen.getByRole("searchbox"), "zzz");
    await act(() => vi.advanceTimersByTimeAsync(260));

    expect(await screen.findByText('Không tìm thấy ai khớp với "zzz"')).toBeInTheDocument();
  });

  it("shows the empty state when there is nobody", async () => {
    vi.spyOn(userService, "fetchFollowList").mockResolvedValue({ users: [] });
    renderDialog();
    expect(await screen.findByText("Chưa có người theo dõi nào")).toBeInTheDocument();
  });

  it("follows from a row through the store (target followers +1)", async () => {
    vi.spyOn(userService, "fetchFollowList").mockResolvedValue(pageOf(["u1"]));
    useAuthStore.setState({ user: { id: "v1", email: "v1@ysocial.dev" }, hydrated: true });
    vi.spyOn(userService, "followUser").mockResolvedValue("accepted");
    renderDialog();
    await waitFor(() => expect(rows()).toHaveLength(1));

    await userEvent.click(within(rows()[0]).getByRole("button", { name: "Theo dõi" }));

    expect(useUserStore.getState().users.u1.followersCount).toBe(6);
    expect(userService.followUser).toHaveBeenCalledWith("u1", "v1");
  });

  it("hides the follow button on the signed-in user's own row", async () => {
    useAuthStore.setState({ user: { id: "u1", email: "u1@ysocial.dev", username: "user.u1" }, hydrated: true });
    vi.spyOn(userService, "fetchFollowList").mockResolvedValue(pageOf(["u1", "u2"]));
    renderDialog();
    await waitFor(() => expect(rows()).toHaveLength(2));

    expect(within(rows()[0]).queryByRole("button")).toBeNull();
    expect(within(rows()[1]).getByRole("button", { name: "Theo dõi" })).toBeInTheDocument();
  });

  it("closes the dialog when a profile link is clicked", async () => {
    vi.spyOn(userService, "fetchFollowList").mockResolvedValue(pageOf(["u1"]));
    const { onOpenChange } = renderDialog();
    await waitFor(() => expect(rows()).toHaveLength(1));

    await userEvent.click(within(rows()[0]).getByRole("link", { name: /User u1/ }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows an error state on first-page failure, with a retry that refetches", async () => {
    const spy = vi
      .spyOn(userService, "fetchFollowList")
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(pageOf(["u1"]));
    renderDialog();

    expect(await screen.findByText("Không tải được nội dung")).toBeInTheDocument();
    expect(screen.queryByText("Chưa có người theo dõi nào")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Thử lại" }));

    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("does not loop-retry after a loadMore failure; offers an inline retry instead", async () => {
    // Mimics a real IntersectionObserver: it fires as soon as it observes a still-visible sentinel
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        callback: ObserverCallback;
        constructor(callback: ObserverCallback) {
          this.callback = callback;
        }
        observe() {
          this.callback([{ isIntersecting: true }]);
        }
        unobserve() {}
        disconnect() {}
        takeRecords() {
          return [];
        }
      },
    );
    const spy = vi
      .spyOn(userService, "fetchFollowList")
      .mockImplementation(async (_id, _kind, { page }) => (page === 1 ? pageOf(idsRange(1, 20), 2) : Promise.reject(new Error("boom"))));
    renderDialog();

    await waitFor(() => expect(rows()).toHaveLength(20));
    await waitFor(() => expect(screen.getByText("Không tải được nội dung")).toBeInTheDocument());
    // Give any runaway re-observe loop a chance to happen before asserting it didn't
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(spy.mock.calls.filter(([, , { page }]) => page === 2)).toHaveLength(1);
  });

  it("asks for confirmation before unfollowing", async () => {
    useAuthStore.setState({ user: { id: "v1", email: "v1@ysocial.dev" }, hydrated: true });
    vi.spyOn(userService, "fetchFollowList").mockResolvedValue({ users: [makeUser("u2", { isFollowing: true, followStatus: "accepted" })] });
    const unfollow = vi.spyOn(userService, "unfollowUser").mockResolvedValue();
    renderDialog();
    await waitFor(() => expect(rows()).toHaveLength(1));

    await userEvent.click(within(rows()[0]).getByRole("button", { name: "Đang theo dõi" }));

    expect(await screen.findByText("Bỏ theo dõi @user.u2?")).toBeInTheDocument();
    expect(unfollow).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Bỏ theo dõi" }));
    await waitFor(() => expect(unfollow).toHaveBeenCalledWith("u2", "v1"));
  });
});

describe("FollowersDialog locked list", () => {
  it("locked page shows the locked empty state, not an error and not 'no followers'", async () => {
    vi.spyOn(userService, "fetchFollowList").mockResolvedValue({ users: [], locked: true });
    renderDialog();

    expect(await screen.findByText("Tài khoản riêng tư, danh sách không hiển thị")).toBeInTheDocument();
    expect(screen.queryByText("Không tải được nội dung")).toBeNull();
    expect(screen.queryByText("Chưa có người theo dõi nào")).toBeNull();
  });
});

import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Providers } from "@/app/providers";
import { useAuthStore } from "@/features/auth";
import * as postService from "@/features/posts/services/post-service";
import { resetPostStore } from "@/features/posts/store/post-store";
import type { PostItem } from "@/features/posts/types";
import { useUIStore } from "@/lib/store/ui-store";
import { SEED_DEMO_ACCOUNT } from "@/mocks/seed-authors";
import { makeUserProfile } from "../mocks/user-fixtures";
import * as userService from "../services/user-service";
import { resetUserStore, useUserStore } from "../store/user-store";
import type { UserProfile } from "../types";
import { ProfileContainer } from "./profile-container";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh }),
}));

const DEMO_AUTH = {
  id: SEED_DEMO_ACCOUNT.id,
  email: "member@ysocial.dev",
  username: SEED_DEMO_ACCOUNT.username,
  displayName: SEED_DEMO_ACCOUNT.displayName,
};

const profile = (overrides: Partial<UserProfile> = {}): UserProfile =>
  makeUserProfile({
    id: "author-03",
    displayName: "Trần Anh Quốc",
    username: "anquoc.dev",
    bio: "Bio của Quốc",
    followersCount: 100,
    followingCount: 10,
    ...overrides,
  });

const demoProfile = profile({ id: "1", displayName: "YSocial Member", username: "ysocial_member", bio: undefined });

const emptyPage = { posts: [] as PostItem[], parents: [], nextPage: undefined, locked: false };

const signedOut = () =>
  useAuthStore.setState({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false, hydrated: true });
const signedInAsDemo = () =>
  useAuthStore.setState({ user: DEMO_AUTH, accessToken: "a", refreshToken: "r", isAuthenticated: true, hydrated: true });

beforeEach(() => {
  vi.restoreAllMocks();
  refresh.mockClear();
  resetPostStore();
  resetUserStore();
  useUIStore.setState({ composerOpen: false });
  vi.spyOn(postService, "fetchUserPosts").mockResolvedValue(emptyPage);
  vi.spyOn(postService, "fetchSavedPosts").mockResolvedValue({ posts: [] });
  vi.spyOn(userService, "fetchUserByUsername").mockImplementation(async (username) =>
    username.toLowerCase() === "anquoc.dev" ? profile() : null,
  );
  vi.spyOn(userService, "upsertViewerUser").mockResolvedValue(demoProfile);
  vi.spyOn(userService, "fetchUser").mockResolvedValue(null);
});

afterEach(() => {
  useAuthStore.setState({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false, hydrated: false });
});

describe("ProfileContainer hydration gate", () => {
  it("shows the skeleton until auth is hydrated and never flashes not-found", () => {
    useAuthStore.setState({ user: null, hydrated: false });
    render(<ProfileContainer username="anquoc.dev" />);

    expect(screen.getByTestId("profile-skeleton")).toBeInTheDocument();
    expect(screen.queryByText("Phiên đăng nhập đã thay đổi")).toBeNull();
  });
});

describe("ProfileContainer identity", () => {
  it("renders a seed profile for a guest without Saved or Edit (actor id never means own)", async () => {
    signedOut();
    render(<ProfileContainer username="anquoc.dev" />);

    expect(await screen.findByRole("heading", { name: "Trần Anh Quốc" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Đã lưu" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Chỉnh sửa trang cá nhân" })).toBeNull();
  });

  it("offers Saved and Edit on the signed-in user's own profile", async () => {
    signedInAsDemo();
    render(<ProfileContainer username="ysocial_member" />);

    expect(await screen.findByRole("heading", { name: "YSocial Member" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Đã lưu" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Chỉnh sửa trang cá nhân" })).toBeInTheDocument();
  });

  it("falls back to Threads and never loads Saved for a guest after logging out on the Saved tab", async () => {
    signedInAsDemo();
    render(<ProfileContainer username="ysocial_member" />);
    await userEvent.click(await screen.findByRole("tab", { name: "Đã lưu" }));
    await waitFor(() => expect(postService.fetchSavedPosts).toHaveBeenCalledWith("1", 1));
    vi.mocked(postService.fetchSavedPosts).mockClear();

    act(() => useAuthStore.getState().actions.clearAuth());

    await waitFor(() => expect(screen.getByRole("tab", { name: "Thread" })).toHaveAttribute("aria-selected", "true"));
    expect(screen.queryByRole("tab", { name: "Đã lưu" })).toBeNull();
    expect(postService.fetchSavedPosts).not.toHaveBeenCalled();
  });

  it("shows the desync state with a reload action when the route user cannot be resolved", async () => {
    signedOut();
    render(<ProfileContainer username="ghost.user" />);

    expect(await screen.findByText("Phiên đăng nhập đã thay đổi")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Tải lại" }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("register -> F5: waits on the shared viewer registration, no false desync", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }));
    const runtime = profile({ id: "2", username: "new.user", displayName: "new.user", bio: undefined });
    const upsert = vi.mocked(userService.upsertViewerUser);
    upsert.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(runtime), 500)));
    useAuthStore.setState({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false, hydrated: false });
    localStorage.setItem("ysocial_user", JSON.stringify({ id: "2", email: "new@ysocial.dev", username: "new.user" }));
    localStorage.setItem("ysocial_access_token", "a");
    localStorage.setItem("ysocial_refresh_token", "r");

    render(
      <Providers>
        <ProfileContainer username="new.user" />
      </Providers>,
    );

    expect(screen.getByTestId("profile-skeleton")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "new.user" }, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.queryByText("Phiên đăng nhập đã thay đổi")).toBeNull();
    expect(upsert).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
    localStorage.removeItem("ysocial_user");
    localStorage.removeItem("ysocial_access_token");
    localStorage.removeItem("ysocial_refresh_token");
  });
});

describe("ProfileContainer tabs", () => {
  it("moves selection and focus with ArrowRight", async () => {
    signedOut();
    render(<ProfileContainer username="anquoc.dev" />);
    const threads = await screen.findByRole("tab", { name: "Thread" });
    threads.focus();

    await userEvent.keyboard("{ArrowRight}");

    const replies = screen.getByRole("tab", { name: "Trả lời" });
    expect(replies).toHaveAttribute("aria-selected", "true");
    expect(replies).toHaveFocus();
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "profile-tab-replies");
  });

  it("isolates a failing tab: header and the other tabs keep working", async () => {
    signedOut();
    vi.mocked(postService.fetchUserPosts).mockImplementation(async (_user, tab) => {
      if (tab === "threads") throw new Error("boom");
      return emptyPage;
    });
    render(<ProfileContainer username="anquoc.dev" />);

    expect(await screen.findByText("Không tải được nội dung")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Trần Anh Quốc" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Trả lời" }));
    expect(await screen.findByText("Chưa có câu trả lời nào")).toBeInTheDocument();
  });

  it("own empty Threads CTA opens the global composer", async () => {
    signedInAsDemo();
    render(<ProfileContainer username="ysocial_member" />);

    await userEvent.click(await screen.findByRole("button", { name: "Đăng thread đầu tiên" }));

    expect(useUIStore.getState().composerOpen).toBe(true);
  });
});

describe("ProfileContainer follow & edit", () => {
  it("follows from the header through the service", async () => {
    signedInAsDemo();
    const follow = vi.spyOn(userService, "followUser").mockResolvedValue("accepted");
    render(<ProfileContainer username="anquoc.dev" />);

    await userEvent.click(await screen.findByRole("button", { name: "Theo dõi" }));

    expect(follow).toHaveBeenCalledWith("author-03", DEMO_AUTH.id);
  });

  it("edits the own profile through the service and updates the header from the store", async () => {
    signedInAsDemo();
    const update = vi.spyOn(userService, "updateProfile").mockResolvedValue({ ...demoProfile, displayName: "Tên Mới" });
    render(<ProfileContainer username="ysocial_member" />);

    await userEvent.click(await screen.findByRole("button", { name: "Chỉnh sửa trang cá nhân" }));
    const dialog = await screen.findByRole("dialog");
    const name = within(dialog).getByLabelText("Tên hiển thị");
    await userEvent.clear(name);
    await userEvent.type(name, "Tên Mới");
    await userEvent.click(within(dialog).getByRole("button", { name: "Lưu" }));

    await waitFor(() => expect(update).toHaveBeenCalledWith("1", expect.objectContaining({ displayName: "Tên Mới" }), "1"));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Tên Mới" })).toBeInTheDocument());
    expect(useUserStore.getState().users["1"].displayName).toBe("Tên Mới");
  });

  it("upserts the service's returned projection, not the raw submitted patch", async () => {
    signedInAsDemo();
    // The service may normalize/trim server-side; its response differs from what the form submitted
    vi.spyOn(userService, "updateProfile").mockResolvedValue({ ...demoProfile, displayName: "Tên Chuẩn Hoá", bio: "Bio từ server" });
    render(<ProfileContainer username="ysocial_member" />);

    await userEvent.click(await screen.findByRole("button", { name: "Chỉnh sửa trang cá nhân" }));
    const dialog = await screen.findByRole("dialog");
    const name = within(dialog).getByLabelText("Tên hiển thị");
    await userEvent.clear(name);
    await userEvent.type(name, "Tên Nhập Vào");
    await userEvent.click(within(dialog).getByRole("button", { name: "Lưu" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Tên Chuẩn Hoá" })).toBeInTheDocument());
    expect(useUserStore.getState().users["1"].bio).toBe("Bio từ server");
  });

  it("validates the display name length before calling the service", async () => {
    signedInAsDemo();
    const update = vi.spyOn(userService, "updateProfile");
    render(<ProfileContainer username="ysocial_member" />);

    await userEvent.click(await screen.findByRole("button", { name: "Chỉnh sửa trang cá nhân" }));
    const dialog = await screen.findByRole("dialog");
    const name = within(dialog).getByLabelText("Tên hiển thị");
    await userEvent.clear(name);
    await userEvent.type(name, "A");
    await userEvent.click(within(dialog).getByRole("button", { name: "Lưu" }));

    expect(await within(dialog).findByText("Tên hiển thị phải từ 2 ký tự")).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });
});

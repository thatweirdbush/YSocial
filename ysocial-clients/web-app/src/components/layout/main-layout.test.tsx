import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth";
import { resetNotificationStore, useNotificationStore } from "@/features/notifications/store/notification-store";
import { MainLayout } from "./main-layout";

vi.mock("./right-sidebar", () => ({ RightSidebar: () => <div data-testid="right-sidebar" /> }));
vi.mock("@/features/posts", () => ({ PostCreatorDialog: () => null }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

beforeEach(() => {
  useAuthStore.setState({ user: { id: "1", email: "member@ysocial.dev", username: "ysocial_member", displayName: "YSocial Member" } });
});

afterEach(() => {
  useAuthStore.setState({ user: null });
});

describe("MainLayout aside", () => {
  it("renders the default right sidebar without an aside", () => {
    render(<MainLayout>content</MainLayout>);

    expect(screen.getByTestId("right-sidebar")).toBeInTheDocument();
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("replaces the right sidebar with the given aside", () => {
    render(<MainLayout aside={<nav aria-label="custom aside">links</nav>}>content</MainLayout>);

    expect(screen.queryByTestId("right-sidebar")).toBeNull();
    expect(screen.getByRole("navigation", { name: "custom aside" })).toBeInTheDocument();
  });
});

describe("MainLayout account menu", () => {
  const openMenu = () => userEvent.click(screen.getByRole("button", { name: /YSocial Member/ }));

  it("links to the settings for a signed-in user", async () => {
    render(<MainLayout>content</MainLayout>);
    await openMenu();

    expect(screen.getByRole("link", { name: "Cài đặt" })).toHaveAttribute("href", "/settings");
  });

  it("hides the settings link from a guest", async () => {
    useAuthStore.setState({ user: null });
    render(<MainLayout>content</MainLayout>);
    await userEvent.click(screen.getByRole("button", { name: /YSocial User/ }));

    expect(screen.queryByRole("link", { name: "Cài đặt" })).toBeNull();
  });
});

describe("MainLayout notifications badge", () => {
  afterEach(() => resetNotificationStore());

  it("shows the unread count on every notifications link (sidebar & mobile bar) and speaks it in the link name", () => {
    useAuthStore.setState({ isAuthenticated: true });
    render(<MainLayout>content</MainLayout>);
    act(() => useNotificationStore.setState({ unreadCount: 3 }));

    const links = screen.getAllByRole("link", { name: /Thông báo/ });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAccessibleName(/3 chưa đọc/);
      expect(link).toHaveAttribute("href", "/notifications");
    }
    expect(screen.getAllByText("3")).toHaveLength(2);
    useAuthStore.setState({ isAuthenticated: false });
  });

  it("no badge at zero", () => {
    useAuthStore.setState({ isAuthenticated: true });
    render(<MainLayout>content</MainLayout>);

    expect(screen.queryByText("chưa đọc", { exact: false })).toBeNull();
    useAuthStore.setState({ isAuthenticated: false });
  });
});

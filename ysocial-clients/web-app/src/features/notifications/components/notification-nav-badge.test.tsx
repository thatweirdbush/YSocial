import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useAuthStore } from "@/features/auth";
import { resetNotificationStore, useNotificationStore } from "../store/notification-store";
import { NotificationNavBadge } from "./notification-nav-badge";

const setCount = (unreadCount: number) => act(() => useNotificationStore.setState({ unreadCount }));

beforeEach(() => {
  resetNotificationStore();
  useAuthStore.setState({ isAuthenticated: true });
});
afterEach(() => useAuthStore.setState({ isAuthenticated: false }));

describe("NotificationNavBadge", () => {
  it("renders nothing at zero", () => {
    const { container } = render(<NotificationNavBadge />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the count & speaks it", () => {
    setCount(3);
    render(<NotificationNavBadge />);
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("3 chưa đọc")).toHaveClass("sr-only");
  });

  it("caps the visible number at 99+ but speaks the real count", () => {
    setCount(250);
    render(<NotificationNavBadge />);
    expect(screen.getByText("99+")).toBeInTheDocument();
    expect(screen.getByText("250 chưa đọc")).toBeInTheDocument();
  });

  it("follows the store live", () => {
    render(<NotificationNavBadge />);
    setCount(1);
    expect(screen.getByText("1")).toBeInTheDocument();
    setCount(0);
    expect(screen.queryByText("1")).toBeNull();
  });

  it("is hidden for a guest even with a stale count", () => {
    setCount(5);
    useAuthStore.setState({ isAuthenticated: false });
    const { container } = render(<NotificationNavBadge />);
    expect(container).toBeEmptyDOMElement();
  });

  it("is absolutely positioned (no layout shift)", () => {
    setCount(2);
    render(<NotificationNavBadge />);
    expect(screen.getByText("2").className).toContain("absolute");
  });
});

import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth";
import { SettingsGuestGate } from "./settings-guest-gate";

vi.mock("@/components/layout/main-layout", () => ({
  MainLayout: ({ children }: { children: React.ReactNode }) => <div data-testid="shell">{children}</div>,
}));

beforeEach(() => {
  useAuthStore.setState({ user: null, hydrated: true });
});

afterEach(() => {
  useAuthStore.setState({ user: null, hydrated: false });
});

describe("SettingsGuestGate", () => {
  it("shows a login call to action inside the app shell for a guest", () => {
    render(
      <SettingsGuestGate>
        <p>secret settings</p>
      </SettingsGuestGate>,
    );

    expect(screen.getByTestId("shell")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Đăng nhập để mở cài đặt" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Đăng nhập" })).toHaveAttribute("href", "/login");
    expect(screen.queryByText("secret settings")).toBeNull();
  });

  it("renders the children for a signed-in user", () => {
    useAuthStore.setState({ user: { id: "1", email: "member@ysocial.dev" } });
    render(
      <SettingsGuestGate>
        <p>secret settings</p>
      </SettingsGuestGate>,
    );

    expect(screen.getByText("secret settings")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Đăng nhập" })).toBeNull();
  });

  it("renders nothing until auth is hydrated (no gate flash for a signed-in user)", () => {
    useAuthStore.setState({ user: null, hydrated: false });
    const { container } = render(
      <SettingsGuestGate>
        <p>secret settings</p>
      </SettingsGuestGate>,
    );

    expect(container).toBeEmptyDOMElement();

    act(() => useAuthStore.setState({ user: { id: "1", email: "member@ysocial.dev" }, hydrated: true }));
    expect(screen.getByText("secret settings")).toBeInTheDocument();
  });
});

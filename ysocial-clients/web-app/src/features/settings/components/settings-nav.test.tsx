import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsIndex } from "./settings-index";
import { SettingsNav } from "./settings-nav";
import { SettingsPageHeader } from "./settings-page-header";

const navigation = vi.hoisted(() => ({ pathname: "/settings/blocked" }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

const SECTION_HREFS = ["/settings/privacy", "/settings/blocked", "/settings/muted", "/settings/close-friends"];

beforeEach(() => {
  navigation.pathname = "/settings/blocked";
});

describe("SettingsNav", () => {
  it("links to the 4 sections and marks the active one", () => {
    render(<SettingsNav />);

    const nav = screen.getByRole("navigation", { name: "Cài đặt" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(SECTION_HREFS);
    expect(within(nav).getByRole("link", { name: "Đã chặn" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Quyền riêng tư" })).not.toHaveAttribute("aria-current");
  });

  it("marks nothing active outside a section", () => {
    navigation.pathname = "/settings";
    render(<SettingsNav />);

    expect(screen.queryAllByRole("link").some((link) => link.hasAttribute("aria-current"))).toBe(false);
  });
});

describe("SettingsIndex", () => {
  it("renders a title and the 4 section links, without the section nav landmark", () => {
    navigation.pathname = "/settings";
    render(<SettingsIndex />);

    expect(screen.getByRole("heading", { level: 1, name: "Cài đặt" })).toBeInTheDocument();
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(SECTION_HREFS);
  });
});

describe("SettingsPageHeader", () => {
  it("shows the section title as the page heading with a Back link to the index", () => {
    render(<SettingsPageHeader title="settings.privacy" />);

    expect(screen.getByRole("heading", { level: 1, name: "Quyền riêng tư" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Quay lại" })).toHaveAttribute("href", "/settings");
  });
});

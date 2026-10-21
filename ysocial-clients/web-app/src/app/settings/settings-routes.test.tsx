import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth";
import SectionsLayout from "./(sections)/layout";
import { metadata as accountMetadata } from "./(sections)/account/page";
import { metadata as appearanceMetadata } from "./(sections)/appearance/page";
import { metadata as blockedMetadata } from "./(sections)/blocked/page";
import { metadata as closeFriendsMetadata } from "./(sections)/close-friends/page";
import { metadata as contentMetadata } from "./(sections)/content/page";
import { metadata as languageMetadata } from "./(sections)/language/page";
import { metadata as mutedMetadata } from "./(sections)/muted/page";
import { metadata as notificationsMetadata } from "./(sections)/notifications/page";
import { metadata as privacyMetadata } from "./(sections)/privacy/page";
import { metadata as sessionsMetadata } from "./(sections)/sessions/page";
import { metadata as timeManagementMetadata } from "./(sections)/time-management/page";
import SettingsLayout, { metadata as settingsMetadata } from "./layout";
import SettingsPage, { metadata as indexMetadata } from "./page";

const shell = vi.hoisted(() => ({ props: [] as Array<{ hasAside: boolean }> }));
vi.mock("@/components/layout/main-layout", () => ({
  MainLayout: ({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) => {
    shell.props.push({ hasAside: aside !== undefined });
    return (
      <div data-testid="shell">
        <div data-testid="aside">{aside}</div>
        <main>{children}</main>
      </div>
    );
  },
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/settings/blocked",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
// The sections' own content is covered by the feature tests
vi.mock("@/features/profile", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/profile")>()),
  BlockedUserList: () => <div data-testid="blocked-list" />,
}));

beforeEach(() => {
  shell.props.length = 0;
  useAuthStore.setState({ user: { id: "1", email: "member@ysocial.dev" }, hydrated: true });
});

afterEach(() => {
  useAuthStore.setState({ user: null, hydrated: false });
});

const settingsLinks = () => screen.queryAllByRole("link").filter((link) => link.getAttribute("href")?.startsWith("/settings/"));

describe("settings route metadata", () => {
  it("keeps every settings route out of search engines and titles each page uniquely", () => {
    expect(settingsMetadata.robots).toEqual({ index: false, follow: false });

    const titles = [
      indexMetadata,
      privacyMetadata,
      notificationsMetadata,
      blockedMetadata,
      mutedMetadata,
      closeFriendsMetadata,
      appearanceMetadata,
      languageMetadata,
      contentMetadata,
      timeManagementMetadata,
      accountMetadata,
      sessionsMetadata,
    ].map((metadata) => String(metadata.title));
    expect(new Set(titles).size).toBe(12);
    expect(titles.every((title) => title.endsWith("• YSocial"))).toBe(true);
  });
});

describe("root settings layout", () => {
  it("only gates by auth: no navigation of its own", () => {
    render(
      <SettingsLayout>
        <p>child</p>
      </SettingsLayout>,
    );

    expect(screen.getByText("child")).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("shows the guest gate instead of the children for a guest", () => {
    useAuthStore.setState({ user: null });
    render(
      <SettingsLayout>
        <p>child</p>
      </SettingsLayout>,
    );

    expect(screen.queryByText("child")).toBeNull();
    expect(screen.getByRole("link", { name: "Đăng nhập" })).toBeInTheDocument();
  });
});

describe("/settings index page", () => {
  it("lists the 9 sections in the center column and uses the default right sidebar (no SettingsNav)", () => {
    render(<SettingsPage />);

    expect(settingsLinks()).toHaveLength(9);
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(shell.props.every((props) => !props.hasAside)).toBe(true);
  });
});

describe("section layout", () => {
  it("shows the section nav once, in the aside, next to the page", () => {
    render(
      <SectionsLayout>
        <p>section page</p>
      </SectionsLayout>,
    );

    expect(screen.getAllByRole("navigation")).toHaveLength(1);
    expect(screen.getByTestId("aside")).toContainElement(screen.getByRole("navigation"));
    expect(screen.getByText("section page")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Đã chặn" })).toHaveAttribute("aria-current", "page");
    expect(shell.props.every((props) => props.hasAside)).toBe(true);
  });
});

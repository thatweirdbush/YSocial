import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth";
import { resetPostStore } from "@/features/posts/store/post-store";
import { __resetBlockGraph } from "@/mocks/block-graph";
import { __resetPrivacy } from "@/mocks/privacy";
import { __resetRelationGraph } from "@/mocks/relation-graph";
import * as relationService from "../services/relation-service";
import * as userService from "../services/user-service";
import { resetOpLedger } from "../store/op-ledger";
import { commitRespondRequest, ensureRelationSets, resetRelationStore } from "../store/relation-store";
import { resetUserStore } from "../store/user-store";
import { FollowRequestsBanner } from "./follow-requests-banner";

vi.mock("next/navigation", () => ({
  usePathname: () => "/notifications",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

const WAIT = { timeout: 3000 };
const avatars = (container: HTMLElement) => container.querySelectorAll('[data-slot="avatar"]');

beforeEach(() => {
  vi.restoreAllMocks();
  resetUserStore();
  resetRelationStore();
  resetPostStore();
  resetOpLedger();
  __resetRelationGraph();
  __resetBlockGraph();
  __resetPrivacy();
  userService.__resetMockUsers();
  useAuthStore.setState({ user: { id: "1", email: "member@ysocial.dev" } });
});

afterEach(() => {
  useAuthStore.setState({ user: null });
});

describe("FollowRequestsBanner", () => {
  it("shows the pending count, 3 avatars and a link to the requests section", async () => {
    await ensureRelationSets("1");
    const { container } = render(<FollowRequestsBanner />);

    const link = await screen.findByRole("link", { name: /4 yêu cầu theo dõi/ }, WAIT);
    expect(link).toHaveAttribute("href", "/settings/privacy#requests");
    await waitFor(() => expect(avatars(container)).toHaveLength(3), WAIT);
    expect(screen.getByText("Duyệt hoặc xoá yêu cầu")).toBeInTheDocument();
  });

  it("loads the relation sets itself when they are not loaded yet", async () => {
    render(<FollowRequestsBanner />);

    expect(await screen.findByRole("link", { name: /4 yêu cầu theo dõi/ }, WAIT)).toBeInTheDocument();
  });

  it("renders nothing while the relation sets are not loaded", () => {
    vi.spyOn(relationService, "fetchRelationSets").mockReturnValue(new Promise(() => undefined));
    const { container } = render(<FollowRequestsBanner />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when there are no requests", async () => {
    vi.spyOn(relationService, "fetchRelationSets").mockResolvedValue({
      blocked: [],
      blockedBy: [],
      muted: [],
      closeFriends: [],
      isPrivate: true,
      requestCount: 0,
    });
    const { container } = render(<FollowRequestsBanner />);
    await ensureRelationSets("1");

    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("renders nothing for a guest and never calls the service", async () => {
    useAuthStore.setState({ user: null });
    const count = vi.spyOn(relationService, "fetchFollowRequests");
    const { container } = render(<FollowRequestsBanner />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(count).not.toHaveBeenCalled();
  });

  it("follows the live count as requests get answered", async () => {
    await ensureRelationSets("1");
    render(<FollowRequestsBanner />);
    await screen.findByRole("link", { name: /4 yêu cầu theo dõi/ }, WAIT);

    for (const requester of ["author-02", "author-08"]) await commitRespondRequest("1", requester, "decline");

    await waitFor(() => expect(screen.getByRole("link", { name: /2 yêu cầu theo dõi/ })).toBeInTheDocument(), WAIT);
  });
});

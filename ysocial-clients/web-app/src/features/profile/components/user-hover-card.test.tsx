import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Link from "next/link";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GUEST_ACTOR_ID, useAuthStore } from "@/features/auth/store/auth-store";
import { PostCard } from "@/features/posts";
import type { PostItem } from "@/features/posts/types";
import { makeUserProfile } from "../mocks/user-fixtures";
import * as service from "../services/user-service";
import { resetUserStore, useUserStore } from "../store/user-store";
import type { UserProfile } from "../types";
import { UserHoverCard } from "./user-hover-card";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const author: UserProfile = makeUserProfile({
  id: "author-01",
  displayName: "Antigravity Architect",
  username: "antigravity.core",
  bio: "Kiến trúc sư phần mềm.",
  followersCount: 48_200,
  followingCount: 120,
  isVerified: true,
});

// Intl inserts a no-break space; Testing Library normalizes DOM whitespace to plain spaces
const compact = (n: number) => new Intl.NumberFormat("vi-VN", { notation: "compact" }).format(n).replace(/\s/g, " ");
const OPEN_WAIT = { timeout: 1500 };

const renderCard = (userId = author.id) =>
  render(
    <UserHoverCard userId={userId}>
      <a href={`/@${author.username}`}>{author.displayName}</a>
    </UserHoverCard>,
  );

beforeEach(() => {
  resetUserStore();
  vi.restoreAllMocks();
  useAuthStore.setState({ user: { id: "v1", email: "v1@ysocial.dev" } });
});

afterEach(() => {
  useAuthStore.setState({ user: null });
});

describe("UserHoverCard", () => {
  it("shows a skeleton, then the fetched profile", async () => {
    let resolve!: (user: UserProfile) => void;
    vi.spyOn(service, "fetchUser").mockReturnValue(new Promise((res) => (resolve = res)));
    renderCard();

    await userEvent.hover(screen.getByRole("link", { name: author.displayName }));
    expect(await screen.findByTestId("hover-card-skeleton", {}, OPEN_WAIT)).toBeInTheDocument();

    resolve(author);
    expect(await screen.findByText("@antigravity.core")).toBeInTheDocument();
    expect(screen.getByText("Kiến trúc sư phần mềm.")).toBeInTheDocument();
    expect(screen.getByText(compact(48_200))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Theo dõi" })).toBeInTheDocument();
  });

  it("uses the cached user without fetching", async () => {
    useUserStore.getState().actions.upsertUsers([author], "v1");
    const spy = vi.spyOn(service, "fetchUser");
    renderCard();

    await userEvent.hover(screen.getByRole("link", { name: author.displayName }));

    expect(await screen.findByText("@antigravity.core", {}, OPEN_WAIT)).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it("fetches the follow state for a user cached by another viewer", async () => {
    useUserStore.getState().actions.upsertUsers([author], "v0");
    const spy = vi.spyOn(service, "fetchUser").mockResolvedValue({ ...author, isFollowing: true, followStatus: "accepted" });
    renderCard();

    await userEvent.hover(screen.getByRole("link", { name: author.displayName }));

    expect(await screen.findByRole("button", { name: "Đang theo dõi" }, OPEN_WAIT)).toBeInTheDocument();
    expect(spy).toHaveBeenCalledWith(author.id, "v1");
  });

  it("shows an error with retry when the user cannot be loaded", async () => {
    const spy = vi.spyOn(service, "fetchUser").mockResolvedValueOnce(null).mockResolvedValueOnce(author);
    renderCard();

    await userEvent.hover(screen.getByRole("link", { name: author.displayName }));
    expect(await screen.findByText("Không tải được hồ sơ", {}, OPEN_WAIT)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("@antigravity.core")).toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("never opens on the viewer's own name (real guest viewer, not in the user mocks)", async () => {
    useAuthStore.setState({ user: null });
    const spy = vi.spyOn(service, "fetchUser");
    render(
      <UserHoverCard userId={GUEST_ACTOR_ID}>
        <Link href="/@me_ysocial">Me</Link>
      </UserHoverCard>,
    );

    await userEvent.hover(screen.getByRole("link", { name: "Me" }));
    await new Promise((resolve) => setTimeout(resolve, 700));

    expect(screen.queryByText("Không tải được hồ sơ")).toBeNull();
    expect(screen.queryByTestId("hover-card-skeleton")).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("does not open on touch; the trigger stays a profile link", async () => {
    useUserStore.getState().actions.upsertUsers([author], "v1");
    renderCard();
    const trigger = screen.getByRole("link", { name: author.displayName });

    fireEvent.pointerEnter(trigger, { pointerType: "touch" });
    await new Promise((resolve) => setTimeout(resolve, 700));

    expect(screen.queryByText("@antigravity.core")).toBeNull();
    expect(trigger).toHaveAttribute("href", "/@antigravity.core");
  });
});

describe("PostCard follow sync", () => {
  const post: PostItem = {
    id: "p1",
    content: "Xin chào",
    createdAt: new Date().toISOString(),
    likesCount: 0,
    commentsCount: 0,
    isLikedByCurrentUser: false,
    isBookmarkedByCurrentUser: false,
    user: { id: author.id, displayName: author.displayName, username: author.username },
  };

  it("follow in card -> PostCard header button + card count update", async () => {
    useUserStore.getState().actions.upsertUsers([author], "v1");
    vi.spyOn(service, "followUser").mockResolvedValue("accepted");
    render(<PostCard post={post} />);

    await userEvent.hover(screen.getByText(author.displayName));
    const cardCount = await screen.findByText(compact(48_200), {}, OPEN_WAIT);
    const followButtons = screen.getAllByRole("button", { name: "Theo dõi" });
    expect(followButtons).toHaveLength(2);

    await userEvent.click(followButtons[1]);

    await waitFor(() => expect(screen.getAllByRole("button", { name: "Đang theo dõi" })).toHaveLength(2));
    expect(cardCount).toHaveTextContent(compact(48_201));
  });

  it("hides the header Follow button on the viewer's own post", () => {
    useAuthStore.setState({ user: { id: author.id, email: "a@ysocial.dev" } });
    useUserStore.getState().actions.upsertUsers([author], author.id);

    render(<PostCard post={post} />);

    expect(screen.queryByRole("button", { name: "Theo dõi" })).toBeNull();
  });
});

import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GUEST_ACTOR_ID } from "@/features/auth/store/auth-store";
import { resetUserStore, useUserStore } from "@/features/profile/store/user-store";
import { useUIStore } from "@/lib/store/ui-store";
import { INCOMING_CAP, resetPostStore, usePostStore } from "../store/post-store";
import type { PostItem } from "../types";
import * as scroll from "../utils/scroll";
import { NewPostsPill } from "./new-posts-pill";

const makePost = (id: string, authorId: string): PostItem => ({
  id,
  content: id,
  createdAt: "2026-10-06T00:00:00.000Z",
  likesCount: 0,
  commentsCount: 0,
  isLikedByCurrentUser: false,
  isBookmarkedByCurrentUser: false,
  user: { id: authorId, displayName: authorId.toUpperCase(), username: authorId },
});

const actions = () => usePostStore.getState().actions;
const loadFollowGraph = (ids: string[]) =>
  useUserStore.getState().actions.setFollowedIds(GUEST_ACTOR_ID, ids, useUserStore.getState().follows[GUEST_ACTOR_ID]?.version ?? 0);

beforeEach(() => {
  resetPostStore();
  resetUserStore();
  vi.restoreAllMocks();
  vi.spyOn(scroll, "scrollFeedToTop").mockImplementation(() => {});
  actions().setFeedPage("forYou", ["old"], false);
  actions().setFeedPage("following", ["old"], false);
  loadFollowGraph(["a2"]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const buffer = (...posts: PostItem[]) => act(() => posts.forEach((post) => actions().bufferIncoming(post)));

describe("NewPostsPill", () => {
  it("renders nothing without pending posts", () => {
    render(<NewPostsPill tab="forYou" onRefetch={vi.fn()} />);

    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders nothing until the tab has loaded", () => {
    resetPostStore();
    buffer(makePost("n1", "a1"));

    render(<NewPostsPill tab="forYou" onRefetch={vi.fn()} />);

    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows the count and at most 3 author avatars", () => {
    buffer(makePost("n1", "a1"), makePost("n2", "a2"), makePost("n3", "a3"), makePost("n4", "a4"));
    const { container } = render(<NewPostsPill tab="forYou" onRefetch={vi.fn()} />);

    expect(screen.getByRole("button", { name: /4 bài mới/ })).toBeInTheDocument();
    expect(container.querySelectorAll('[data-slot="avatar"]')).toHaveLength(3);
  });

  it("shows each author once even with several pending posts by them", () => {
    buffer(makePost("n1", "a1"), makePost("n2", "a1"), makePost("n3", "a2"));
    const { container } = render(<NewPostsPill tab="forYou" onRefetch={vi.fn()} />);

    expect(screen.getByRole("button", { name: /3 bài mới/ })).toBeInTheDocument();
    expect(container.querySelectorAll('[data-slot="avatar"]')).toHaveLength(2);
  });

  it("uses the singular label for one post in English", () => {
    useUIStore.getState().actions.setLocale("en");
    buffer(makePost("n1", "a1"));

    render(<NewPostsPill tab="forYou" onRefetch={vi.fn()} />);

    expect(screen.getByRole("button", { name: /^1 new post$/ })).toBeInTheDocument();
    useUIStore.getState().actions.setLocale("vi");
  });

  it("flushes pending posts on click and scrolls to the top", async () => {
    buffer(makePost("n1", "a1"), makePost("n2", "a2"));
    const onRefetch = vi.fn();
    render(<NewPostsPill tab="forYou" onRefetch={onRefetch} />);

    await userEvent.click(screen.getByRole("button", { name: /2 bài mới/ }));

    expect(usePostStore.getState().feedIds.forYou).toEqual(["n2", "n1", "old"]);
    expect(scroll.scrollFeedToTop).toHaveBeenCalledTimes(1);
    expect(onRefetch).not.toHaveBeenCalled();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows 20+ on overflow and refetches instead of merging", async () => {
    buffer(...Array.from({ length: INCOMING_CAP + 1 }, (_, i) => makePost(`n${i}`, "a1")));
    const onRefetch = vi.fn().mockResolvedValue(undefined);
    render(<NewPostsPill tab="forYou" onRefetch={onRefetch} />);

    await userEvent.click(screen.getByRole("button", { name: /20\+ bài mới/ }));

    expect(onRefetch).toHaveBeenCalledTimes(1);
    expect(usePostStore.getState().feedIds.forYou).toEqual(["old"]);
    expect(scroll.scrollFeedToTop).toHaveBeenCalledTimes(1);
  });

  it("ignores clicks while the overflow refetch is in flight", async () => {
    buffer(...Array.from({ length: INCOMING_CAP + 1 }, (_, i) => makePost(`n${i}`, "a1")));
    let finish!: () => void;
    const onRefetch = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    render(<NewPostsPill tab="forYou" onRefetch={onRefetch} />);
    const pill = screen.getByRole("button", { name: /20\+ bài mới/ });

    await userEvent.click(pill);
    expect(pill).toHaveAttribute("aria-busy", "true");
    await userEvent.click(pill);
    expect(onRefetch).toHaveBeenCalledTimes(1);

    await act(async () => finish());
    expect(pill).not.toHaveAttribute("aria-busy");
  });

  it("counts only followed authors on the following tab, at read time", () => {
    buffer(makePost("n1", "a1"), makePost("n2", "a2"));
    render(<NewPostsPill tab="following" onRefetch={vi.fn()} />);
    expect(screen.getByRole("button", { name: /1 bài mới/ })).toBeInTheDocument();

    act(() => {
      useUserStore.getState().actions.upsertUsers([{ ...makePost("x", "a1").user, followersCount: 0, followingCount: 0, isFollowing: false }], GUEST_ACTOR_ID);
      useUserStore.getState().actions.toggleFollow(GUEST_ACTOR_ID, "a1");
    });
    expect(screen.getByRole("button", { name: /2 bài mới/ })).toBeInTheDocument();
  });

  it("shows nothing on the following tab before the follow graph is loaded", () => {
    resetUserStore();
    buffer(makePost("n2", "a2"));

    render(<NewPostsPill tab="following" onRefetch={vi.fn()} />);

    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("scrollFeedToTop", () => {
  it("scrolls the document smoothly, or instantly with reduced motion", async () => {
    vi.restoreAllMocks();
    const { scrollFeedToTop } = await vi.importActual<typeof scroll>("../utils/scroll");
    const scrollTo = vi.fn();
    vi.stubGlobal("scrollTo", scrollTo);
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query }));
    scrollFeedToTop();
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: "smooth" });

    vi.stubGlobal("matchMedia", (query: string) => ({ matches: true, media: query }));
    scrollFeedToTop();
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: "auto" });
    vi.unstubAllGlobals();
  });
});

import { act, render, screen, waitFor } from "@testing-library/react";
import { StrictMode, useEffect, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as postService from "@/features/posts/services/post-service";
import { resetPostStore, usePostStore } from "@/features/posts/store/post-store";
import type { ParentReference, PostItem, SavedPostsPage, UserPostsPage } from "@/features/posts/types";
import type { ProfileTab } from "../types";
import { ProfileTabPostsProvider, useProfileTabPosts, useProfileTabPostsController } from "./use-profile-tab-posts";

const makePost = (id: string, overrides: Partial<PostItem> = {}): PostItem => ({
  id,
  content: `content ${id}`,
  createdAt: "2026-10-01T00:00:00.000Z",
  likesCount: 0,
  commentsCount: 0,
  isLikedByCurrentUser: false,
  isBookmarkedByCurrentUser: false,
  user: { id: "u1", displayName: "User", username: "user" },
  ...overrides,
});

const page = (ids: string[], nextPage?: number, parents: ParentReference[] = []): UserPostsPage => ({
  posts: ids.map((id) => makePost(id)),
  parents,
  nextPage,
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const probe: { current?: ReturnType<typeof useProfileTabPosts> } = {};

function Panel({ tab }: { tab: ProfileTab }) {
  const posts = useProfileTabPosts(tab);
  useEffect(() => {
    probe.current = posts;
  });
  return <div data-testid={`panel-${tab}`}>{posts.ids.join(",")}|{posts.status}|{Object.keys(posts.parents).join(",")}</div>;
}

function Harness({ userId, actorId, tabs }: { userId: string; actorId: string; tabs: ProfileTab[] }): ReactNode {
  const controller = useProfileTabPostsController(userId, actorId);
  return (
    <ProfileTabPostsProvider value={controller}>
      {tabs.map((tab) => (
        <Panel key={tab} tab={tab} />
      ))}
    </ProfileTabPostsProvider>
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  resetPostStore();
  probe.current = undefined;
});

describe("useProfileTabPosts", () => {
  it("fetches on first activation only and upserts posts into the post store", async () => {
    const spy = vi.spyOn(postService, "fetchUserPosts").mockResolvedValue(page(["a", "b"]));
    const { rerender } = render(<Harness userId="u1" actorId="v1" tabs={["threads"]} />);

    await waitFor(() => expect(screen.getByTestId("panel-threads")).toHaveTextContent("a,b|ready"));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("u1", "threads", 1);
    expect(usePostStore.getState().posts.a).toBeDefined();

    rerender(<Harness userId="u1" actorId="v1" tabs={[]} />);
    rerender(<Harness userId="u1" actorId="v1" tabs={["threads"]} />);
    expect(screen.getByTestId("panel-threads")).toHaveTextContent("a,b|ready");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("fetches once under StrictMode's double-invoked effects", async () => {
    const spy = vi.spyOn(postService, "fetchUserPosts").mockResolvedValue(page(["a", "b"]));
    render(
      <StrictMode>
        <Harness userId="u1" actorId="v1" tabs={["threads"]} />
      </StrictMode>,
    );

    await waitFor(() => expect(screen.getByTestId("panel-threads")).toHaveTextContent("a,b|ready"));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("loadMore appends the next page without duplicates", async () => {
    vi.spyOn(postService, "fetchUserPosts").mockImplementation(async (_user, _tab, pageNumber) =>
      pageNumber === 1 ? page(["a", "b"], 2) : page(["b", "c"]),
    );
    render(<Harness userId="u1" actorId="v1" tabs={["threads"]} />);
    await waitFor(() => expect(probe.current?.hasMore).toBe(true));

    act(() => probe.current?.loadMore());

    await waitFor(() => expect(screen.getByTestId("panel-threads")).toHaveTextContent("a,b,c|ready"));
    expect(probe.current?.hasMore).toBe(false);
  });

  it("surfaces an error and retries", async () => {
    const spy = vi
      .spyOn(postService, "fetchUserPosts")
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(page(["a"]));
    render(<Harness userId="u1" actorId="v1" tabs={["threads"]} />);
    await waitFor(() => expect(screen.getByTestId("panel-threads")).toHaveTextContent("|error"));

    act(() => probe.current?.retry());

    await waitFor(() => expect(screen.getByTestId("panel-threads")).toHaveTextContent("a|ready"));
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("ignores a stale response of a superseded request", async () => {
    const first = deferred<UserPostsPage>();
    const second = deferred<UserPostsPage>();
    vi.spyOn(postService, "fetchUserPosts").mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    render(<Harness userId="u1" actorId="v1" tabs={["threads"]} />);
    await waitFor(() => expect(probe.current?.status).toBe("loading"));

    act(() => probe.current?.retry());
    await act(async () => second.resolve(page(["fresh"])));
    await act(async () => first.resolve(page(["stale"])));

    await waitFor(() => expect(screen.getByTestId("panel-threads")).toHaveTextContent("fresh|ready"));
    expect(screen.getByTestId("panel-threads")).not.toHaveTextContent("stale");
  });

  it("keeps parent references of the replies tab", async () => {
    const parents: ParentReference[] = [
      { id: "p1", author: { id: "x", displayName: "X", username: "x" }, deleted: false },
      { id: "p2", deleted: true },
    ];
    vi.spyOn(postService, "fetchUserPosts").mockResolvedValue(page(["r1", "r2"], undefined, parents));
    render(<Harness userId="u1" actorId="v1" tabs={["replies"]} />);

    await waitFor(() => expect(screen.getByTestId("panel-replies")).toHaveTextContent("r1,r2|ready|p1,p2"));
    expect(probe.current?.parents.p2).toEqual({ id: "p2", deleted: true });
  });

  it("loads Saved through fetchSavedPosts with the actor id, never fetchUserPosts", async () => {
    const userPosts = vi.spyOn(postService, "fetchUserPosts");
    const saved = vi
      .spyOn(postService, "fetchSavedPosts")
      .mockResolvedValue({ posts: [makePost("s1")], nextPage: undefined } satisfies SavedPostsPage);
    render(<Harness userId="u1" actorId="v1" tabs={["saved"]} />);

    await waitFor(() => expect(screen.getByTestId("panel-saved")).toHaveTextContent("s1|ready"));
    expect(saved).toHaveBeenCalledWith("v1", 1);
    expect(userPosts).not.toHaveBeenCalled();
  });

  it("resets when the actor changes and ignores a late response of the previous actor", async () => {
    const forFirstActor = deferred<SavedPostsPage>();
    const spy = vi
      .spyOn(postService, "fetchSavedPosts")
      .mockImplementation((actorId) => (actorId === "1" ? forFirstActor.promise : Promise.resolve({ posts: [makePost("mine-2")] })));
    const { rerender } = render(<Harness userId="1" actorId="1" tabs={["saved"]} />);
    await waitFor(() => expect(spy).toHaveBeenCalledWith("1", 1));

    rerender(<Harness userId="1" actorId="2" tabs={["saved"]} />);
    await waitFor(() => expect(screen.getByTestId("panel-saved")).toHaveTextContent("mine-2|ready"));
    expect(spy).toHaveBeenCalledWith("2", 1);

    await act(async () => forFirstActor.resolve({ posts: [makePost("mine-1")] }));

    expect(screen.getByTestId("panel-saved")).toHaveTextContent("mine-2|ready");
    expect(screen.getByTestId("panel-saved")).not.toHaveTextContent("mine-1");
  });

  it("clears an already loaded list when the actor changes", async () => {
    vi.spyOn(postService, "fetchSavedPosts").mockImplementation(async (actorId) => ({ posts: [makePost(`saved-${actorId}`)] }));
    const { rerender } = render(<Harness userId="1" actorId="1" tabs={["saved"]} />);
    await waitFor(() => expect(screen.getByTestId("panel-saved")).toHaveTextContent("saved-1|ready"));

    rerender(<Harness userId="1" actorId="2" tabs={["saved"]} />);

    await waitFor(() => expect(screen.getByTestId("panel-saved")).toHaveTextContent("saved-2|ready"));
    expect(screen.getByTestId("panel-saved")).not.toHaveTextContent("saved-1");
  });
});

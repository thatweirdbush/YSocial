import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useAuthStore } from "@/features/auth/store/auth-store";
import { resetUserStore } from "@/features/profile/store/user-store";
import { resetPostStore, usePostStore } from "../store/post-store";
import type { PostItem } from "../types";
import { usePendingFeed } from "./use-pending-feed";

const makePost = (id: string, authorId: string): PostItem => ({
  id,
  kind: "post",
  rootPostId: id,
  content: `content ${id}`,
  createdAt: "2026-10-01T00:00:00.000Z",
  likesCount: 0,
  commentsCount: 0,
  isLikedByCurrentUser: false,
  isBookmarkedByCurrentUser: false,
  user: { id: authorId, displayName: authorId, username: authorId },
});

beforeEach(() => {
  resetPostStore();
  resetUserStore();
  useAuthStore.setState({ user: null });
});

describe("usePendingFeed", () => {
  it("lists buffered posts of non-excluded authors", () => {
    usePostStore.getState().actions.bufferIncoming(makePost("n1", "a"));

    const { result } = renderHook(() => usePendingFeed("forYou"));

    expect(result.current.ids).toEqual(["n1"]);
  });

  it("skips excluded authors even when their posts are already buffered", () => {
    usePostStore.getState().actions.bufferIncoming(makePost("n1", "a"));
    usePostStore.getState().actions.bufferIncoming(makePost("n2", "b"));
    const { result } = renderHook(() => usePendingFeed("forYou"));
    expect(result.current.ids).toEqual(["n2", "n1"]);

    // Bypasses excludeAuthor on purpose: the pill must not depend on the buffer having been purged
    act(() => usePostStore.setState({ excludedAuthors: { a: { muted: true } } }));

    expect(result.current.ids).toEqual(["n2"]);
    expect(result.current.authors.map((author) => author.id)).toEqual(["b"]);
  });
});

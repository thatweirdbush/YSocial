import { act, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as userService from "@/features/profile/services/user-service";
import { resetUserStore } from "@/features/profile/store/user-store";
import * as service from "../services/post-service";
import { resetPostStore, usePostStore } from "../store/post-store";
import type { PostItem } from "../types";
import { useNewPostsStream } from "./use-new-posts-stream";

const post: PostItem = {
  id: "live-1",
  content: "mới",
  createdAt: "2026-10-06T00:00:00.000Z",
  likesCount: 0,
  commentsCount: 0,
  isLikedByCurrentUser: false,
  isBookmarkedByCurrentUser: false,
  user: { id: "author-02", displayName: "Elena", username: "elena_v" },
};

let listeners: ((post: PostItem) => void)[] = [];
let active = 0;

const setVisibility = (state: DocumentVisibilityState) => {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
};

beforeEach(() => {
  resetPostStore();
  resetUserStore();
  vi.restoreAllMocks();
  listeners = [];
  active = 0;
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  vi.spyOn(userService, "fetchUser").mockResolvedValue(null);
  vi.spyOn(service, "subscribeToNewPosts").mockImplementation((listener) => {
    listeners.push(listener);
    active += 1;
    let done = false;
    return () => {
      if (done) return;
      done = true;
      active -= 1;
    };
  });
});

afterEach(() => {
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
});

describe("useNewPostsStream", () => {
  it("subscribes on mount and unsubscribes on unmount", () => {
    const { unmount } = renderHook(() => useNewPostsStream());
    expect(active).toBe(1);

    unmount();
    expect(active).toBe(0);
  });

  it("pauses while the browser tab is hidden", () => {
    renderHook(() => useNewPostsStream());

    act(() => setVisibility("hidden"));
    expect(active).toBe(0);

    act(() => setVisibility("visible"));
    expect(active).toBe(1);
  });

  it("StrictMode mount subscribes once net", () => {
    renderHook(() => useNewPostsStream(), { wrapper: StrictMode });

    expect(active).toBe(1);
  });

  it("buffers received posts and loads their author", () => {
    renderHook(() => useNewPostsStream());

    act(() => listeners[listeners.length - 1](post));

    expect(usePostStore.getState().incoming).toEqual(["live-1"]);
    expect(userService.fetchUser).toHaveBeenCalledWith("author-02", "me");
  });
});

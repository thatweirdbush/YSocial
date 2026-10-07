import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth/store/auth-store";
import * as service from "../services/post-service";
import { resetPostStore, usePostStore } from "../store/post-store";
import type { PostItem } from "../types";
import { isInViewedSubtree, useOwnerActions } from "./use-owner-actions";

const nav = vi.hoisted(() => ({ pathname: "/", replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: vi.fn(), replace: nav.replace, back: vi.fn() }),
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const me = { id: "u1", displayName: "Me", username: "me" };

const makePost = (id: string, overrides: Partial<PostItem> = {}): PostItem => ({
  id,
  content: `content ${id}`,
  createdAt: "2026-10-01T00:00:00.000Z",
  likesCount: 3,
  commentsCount: 0,
  isLikedByCurrentUser: false,
  isBookmarkedByCurrentUser: false,
  user: me,
  ...overrides,
});

/** Promise the test settles by hand. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const store = () => usePostStore.getState();
const render = (id = "A") => renderHook(() => useOwnerActions(id)).result;

beforeEach(() => {
  resetPostStore();
  vi.restoreAllMocks();
  toast.success.mockClear();
  toast.error.mockClear();
  nav.pathname = "/";
  nav.replace.mockClear();
  window.history.replaceState(null, "", "/");
  useAuthStore.setState({ user: { id: "u1", email: "me@ysocial.dev", username: "me" } });
  store().actions.upsertPosts([
    makePost("A", { commentsCount: 1 }),
    makePost("B"),
    makePost("R", { parentId: "A" }),
  ]);
  store().actions.setFeedPage("forYou", ["B", "A"], false);
  store().actions.setReplies("A", ["R"]);
});

afterEach(() => {
  useAuthStore.setState({ user: null });
});

describe("isInViewedSubtree", () => {
  const posts = { A: makePost("A"), R: makePost("R", { parentId: "A" }) };

  it("matches the viewed post itself", () => {
    expect(isInViewedSubtree("/posts/A", "A", posts)).toBe(true);
  });

  it("matches an ancestor of the viewed reply", () => {
    expect(isInViewedSubtree("/posts/R", "A", posts)).toBe(true);
  });

  it("ignores other routes and unrelated posts", () => {
    expect(isInViewedSubtree("/", "A", posts)).toBe(false);
    expect(isInViewedSubtree("/posts/A", "R", posts)).toBe(false);
  });
});

describe("edit", () => {
  it("updates optimistically and releases the lock", async () => {
    vi.spyOn(service, "updatePostContent").mockResolvedValue(makePost("A", { content: "mới", isEdited: true }));
    const result = render();

    let ok = false;
    await act(async () => {
      ok = await result.current.edit("  mới  ");
    });

    expect(ok).toBe(true);
    expect(service.updatePostContent).toHaveBeenCalledWith("A", "mới", "u1");
    expect(store().posts.A).toMatchObject({ content: "mới", isEdited: true });
    expect(store().ownerOpById.A).toBeUndefined();
  });

  it("reverts only the edit fields when rejected, keeping a concurrent hideLikeCount", async () => {
    const call = deferred<PostItem>();
    vi.spyOn(service, "updatePostContent").mockReturnValue(call.promise);
    const result = render();

    let pending!: Promise<boolean>;
    act(() => {
      pending = result.current.edit("mới");
    });
    act(() => store().actions.setHideLikeCount("A", true));
    await act(async () => {
      call.reject(new Error("offline"));
      await pending;
    });

    expect(store().posts.A).toMatchObject({ content: "content A", hideLikeCount: true });
    expect(store().posts.A.isEdited).toBeFalsy();
    expect(toast.error).toHaveBeenCalledWith("Đã có lỗi xảy ra. Vui lòng thử lại!");
  });

  it("applies the service copy over a stale refetch that landed mid-op", async () => {
    const call = deferred<PostItem>();
    vi.spyOn(service, "updatePostContent").mockReturnValue(call.promise);
    const result = render();

    let pending!: Promise<boolean>;
    act(() => {
      pending = result.current.edit("mới");
    });
    act(() => store().actions.upsertPosts([makePost("A", { commentsCount: 1 })]));
    await act(async () => {
      call.resolve(makePost("A", { content: "mới", isEdited: true }));
      await pending;
    });

    expect(store().posts.A).toMatchObject({ content: "mới", isEdited: true });
  });

  it("shows the forbidden message for ForbiddenError", async () => {
    vi.spyOn(service, "updatePostContent").mockRejectedValue(new service.ForbiddenError());
    const result = render();

    await act(async () => {
      await result.current.edit("mới");
    });

    expect(toast.error).toHaveBeenCalledWith("Bạn không có quyền thực hiện thao tác này");
  });

  it("ignores a 2nd op while one is pending", async () => {
    const call = deferred<PostItem>();
    vi.spyOn(service, "updatePostContent").mockReturnValue(call.promise);
    const pin = vi.spyOn(service, "setPostPinned").mockResolvedValue(makePost("A", { isPinned: true }));
    const result = render();

    act(() => {
      void result.current.edit("mới");
    });
    await act(async () => {
      await result.current.togglePin();
    });

    expect(pin).not.toHaveBeenCalled();
    expect(result.current.pendingOp).toBe("edit");
    await act(async () => call.resolve(makePost("A")));
  });
});

describe("togglePin", () => {
  it("restores both posts when the pin is rejected", async () => {
    store().actions.setPinned("B", true);
    vi.spyOn(service, "setPostPinned").mockRejectedValue(new Error("offline"));
    const result = render();

    await act(async () => {
      await result.current.togglePin();
    });

    expect(store().posts.A.isPinned).toBe(false);
    expect(store().posts.B.isPinned).toBe(true);
    expect(store().pinnedIdByAuthor).toEqual({ u1: "B" });
  });

  it("re-applies the pin over a stale refetch that landed mid-op", async () => {
    store().actions.setPinned("B", true);
    const call = deferred<PostItem>();
    vi.spyOn(service, "setPostPinned").mockReturnValue(call.promise);
    const result = render();

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.togglePin();
    });
    act(() => store().actions.upsertPosts([makePost("A"), makePost("B", { isPinned: true })]));
    await act(async () => {
      call.resolve(makePost("A", { isPinned: true }));
      await pending;
    });

    expect(store().posts.A.isPinned).toBe(true);
    expect(store().posts.B.isPinned).toBe(false);
    expect(store().pinnedIdByAuthor).toEqual({ u1: "A" });
  });

  it("pins and reports success", async () => {
    vi.spyOn(service, "setPostPinned").mockResolvedValue(makePost("A", { isPinned: true }));
    const result = render();

    await act(async () => {
      await result.current.togglePin();
    });

    expect(service.setPostPinned).toHaveBeenCalledWith("A", true, "u1");
    expect(store().posts.A.isPinned).toBe(true);
    expect(toast.success).toHaveBeenCalledWith("Đã ghim bài viết");
  });
});

describe("toggleHideLikeCount", () => {
  it("reverts the flag when rejected", async () => {
    vi.spyOn(service, "setHideLikeCount").mockRejectedValue(new Error("offline"));
    const result = render();

    await act(async () => {
      await result.current.toggleHideLikeCount();
    });

    expect(store().posts.A.hideLikeCount).toBe(false);
  });

  it("re-applies the flag over a stale refetch that landed mid-op", async () => {
    const call = deferred<PostItem>();
    vi.spyOn(service, "setHideLikeCount").mockReturnValue(call.promise);
    const result = render();

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.toggleHideLikeCount();
    });
    act(() => store().actions.upsertPosts([makePost("A", { hideLikeCount: false })]));
    await act(async () => {
      call.resolve(makePost("A", { hideLikeCount: true }));
      await pending;
    });

    expect(store().posts.A.hideLikeCount).toBe(true);
  });
});

describe("remove", () => {
  it("removes optimistically and tombstones the service result", async () => {
    const call = deferred<{ deletedIds: string[] }>();
    vi.spyOn(service, "deletePost").mockReturnValue(call.promise);
    const result = render();

    let pending!: Promise<boolean>;
    act(() => {
      pending = result.current.remove();
    });
    expect(store().posts.A).toBeUndefined();
    expect(store().feedIds.forYou).toEqual(["B"]);

    await act(async () => {
      call.resolve({ deletedIds: ["A", "R", "uncached-child"] });
      await pending;
    });

    expect(store().deletedIds).toMatchObject({ A: true, R: true, "uncached-child": true });
    expect(nav.replace).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Đã xoá bài viết");
  });

  it("restores the post when the delete is rejected", async () => {
    vi.spyOn(service, "deletePost").mockRejectedValue(new Error("offline"));
    const result = render();

    await act(async () => {
      await result.current.remove();
    });

    expect(store().posts.A).toBeDefined();
    expect(store().feedIds.forYou).toEqual(["B", "A"]);
    expect(store().deletedIds.A).toBeUndefined();
  });

  it("double delete confirm calls service once", async () => {
    const spy = vi.spyOn(service, "deletePost").mockResolvedValue({ deletedIds: ["A", "R"] });
    const result = render();

    await act(async () => {
      await Promise.all([result.current.remove(), result.current.remove()]);
    });

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it.each(["/posts/A", "/posts/R"])("viewed route %s: removes at once, navigates only after success", async (pathname) => {
    nav.pathname = pathname;
    window.history.replaceState(null, "", pathname);
    const call = deferred<{ deletedIds: string[] }>();
    vi.spyOn(service, "deletePost").mockReturnValue(call.promise);
    const result = render();

    let pending!: Promise<boolean>;
    act(() => {
      pending = result.current.remove();
    });
    expect(store().posts.A).toBeUndefined();
    expect(nav.replace).not.toHaveBeenCalled();

    await act(async () => {
      call.resolve({ deletedIds: ["A", "R"] });
      await pending;
    });
    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(nav.replace).toHaveBeenCalledWith("/");
  });

  it("viewed route: does not navigate when the user left the route before success", async () => {
    nav.pathname = "/posts/A";
    window.history.replaceState(null, "", "/posts/A");
    const call = deferred<{ deletedIds: string[] }>();
    vi.spyOn(service, "deletePost").mockReturnValue(call.promise);
    const result = render();

    let pending!: Promise<boolean>;
    act(() => {
      pending = result.current.remove();
    });
    window.history.replaceState(null, "", "/search");
    await act(async () => {
      call.resolve({ deletedIds: ["A", "R"] });
      await pending;
    });

    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("viewed route failure: restores in place without navigating", async () => {
    nav.pathname = "/posts/A";
    vi.spyOn(service, "deletePost").mockRejectedValue(new Error("offline"));
    const result = render();

    await act(async () => {
      await result.current.remove();
    });

    expect(store().posts.A).toBeDefined();
    expect(store().deletedIds.A).toBeUndefined();
    expect(nav.replace).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });
});

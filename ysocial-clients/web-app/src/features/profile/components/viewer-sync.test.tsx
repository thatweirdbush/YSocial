import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerAuthStorageSync, useAuthStore } from "@/features/auth";
import { dispatchStorage } from "@/test/api-test-utils";
import { getPostActions } from "@/features/posts";
import { resetPostStore, usePostStore } from "@/features/posts/store/post-store";
import * as relationService from "../services/relation-service";
import type { RelationSets } from "../types";
import { getViewerGeneration, resetOpLedger } from "../store/op-ledger";
import * as relationStore from "../store/relation-store";
import * as store from "../store/user-store";
import { ViewerSync } from "./viewer-sync";

const DEMO = { id: "1", email: "member@ysocial.dev", username: "ysocial_member", displayName: "YSocial Member" };

describe("ViewerSync", () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    store.resetUserStore();
    relationStore.resetRelationStore();
    resetPostStore();
    resetOpLedger();
    spy = vi.spyOn(store, "ensureViewerUser").mockResolvedValue(null);
    localStorage.removeItem("ysocial_user");
    localStorage.removeItem("ysocial_access_token");
    useAuthStore.setState({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false, hydrated: false });
  });

  it("does nothing before the auth store is hydrated", () => {
    useAuthStore.setState({ user: DEMO });
    render(<ViewerSync />);
    expect(spy).not.toHaveBeenCalled();
  });

  it("registers the signed-in user once hydrated", () => {
    localStorage.setItem("ysocial_user", JSON.stringify(DEMO));
    render(<ViewerSync />);

    act(() => useAuthStore.getState().actions.hydrate());

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ id: "1", username: "ysocial_member", displayName: "YSocial Member" }), "1");
  });

  it("re-registers when the session changes to another id and ignores same-id updates", () => {
    localStorage.setItem("ysocial_user", JSON.stringify(DEMO));
    const { rerender } = render(<ViewerSync />);
    act(() => useAuthStore.getState().actions.hydrate());
    expect(spy).toHaveBeenCalledTimes(1);

    rerender(<ViewerSync />);
    act(() => useAuthStore.getState().actions.updateUser({ ...DEMO, bio: "changed" }));
    expect(spy).toHaveBeenCalledTimes(1);

    act(() => useAuthStore.getState().actions.updateUser({ id: "2", email: "new@ysocial.dev", username: "new.user" }));
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ id: "2", username: "new.user" }), "2");
  });
});

describe("ViewerSync viewer switch", () => {
  const USER_2 = { id: "2", email: "two@ysocial.dev", username: "two", displayName: "Two" };
  const emptySets: RelationSets = { blocked: [], blockedBy: [], muted: [], closeFriends: [], isPrivate: false, requestCount: 0 };

  beforeEach(() => {
    vi.restoreAllMocks();
    store.resetUserStore();
    relationStore.resetRelationStore();
    resetPostStore();
    resetOpLedger();
    vi.spyOn(store, "ensureViewerUser").mockResolvedValue(null);
    vi.spyOn(store, "ensureFollowGraph").mockResolvedValue();
    useAuthStore.setState({ user: DEMO, accessToken: "a", refreshToken: "r", isAuthenticated: true, hydrated: true });
  });

  it("loads the relation sets of the initial viewer without resetting the feeds", () => {
    const load = vi.spyOn(relationStore, "ensureRelationSets").mockResolvedValue();
    const reset = vi.spyOn(getPostActions(), "resetViewerFeeds");

    render(<ViewerSync />);

    expect(load).toHaveBeenCalledWith("1", { force: true });
    expect(reset).not.toHaveBeenCalled();
  });

  it("resets the viewer feeds once, invalidates the new viewer and reloads its sets on an account switch", () => {
    const load = vi.spyOn(relationStore, "ensureRelationSets").mockResolvedValue();
    const invalidate = vi.spyOn(relationStore, "invalidateViewerProjection");
    const reset = vi.spyOn(getPostActions(), "resetViewerFeeds");
    usePostStore.getState().actions.setFeedPage("forYou", [], false);
    const generation = getViewerGeneration();
    render(<ViewerSync />);

    act(() => useAuthStore.setState({ user: USER_2 }));

    expect(reset).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith("2");
    expect(load).toHaveBeenLastCalledWith("2", { force: true });
    expect(getViewerGeneration()).toBe(generation + 1);
    expect(usePostStore.getState().feedMeta.forYou.loaded).toBe(false);
    expect(store.ensureFollowGraph).toHaveBeenCalledWith("2");
  });

  it("clears the previous viewer's like & bookmark flags on the cached posts when the account switches", () => {
    vi.spyOn(relationStore, "ensureRelationSets").mockResolvedValue();
    const reset = vi.spyOn(getPostActions(), "resetViewerFlags");
    render(<ViewerSync />);

    act(() => useAuthStore.setState({ user: USER_2 }));

    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("a switch made in ANOTHER tab (storage event) takes the same reset path", () => {
    vi.spyOn(relationStore, "ensureRelationSets").mockResolvedValue();
    const invalidate = vi.spyOn(relationStore, "invalidateViewerProjection");
    const resetFeeds = vi.spyOn(getPostActions(), "resetViewerFeeds");
    const resetFlags = vi.spyOn(getPostActions(), "resetViewerFlags");
    localStorage.setItem("ysocial_access_token", "A2");
    localStorage.setItem("ysocial_refresh_token", "R2");
    localStorage.setItem("ysocial_user", JSON.stringify(USER_2));
    render(<ViewerSync />);
    const off = registerAuthStorageSync();

    act(() => dispatchStorage("ysocial_user", JSON.stringify(USER_2)));
    off();

    expect(useAuthStore.getState().user?.id).toBe("2");
    expect(resetFeeds).toHaveBeenCalledTimes(1);
    expect(resetFlags).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith("2");
  });

  it("does not reset again when the same account updates", () => {
    vi.spyOn(relationStore, "ensureRelationSets").mockResolvedValue();
    const reset = vi.spyOn(getPostActions(), "resetViewerFeeds");
    render(<ViewerSync />);

    act(() => useAuthStore.getState().actions.updateUser({ ...DEMO, bio: "changed" }));

    expect(reset).not.toHaveBeenCalled();
  });

  it("never applies the relation sets of the previous viewer to the post store (stale result)", async () => {
    let resolveFirst!: (sets: RelationSets) => void;
    vi.spyOn(relationService, "fetchRelationSets").mockImplementation((actorId) =>
      actorId === "1" ? new Promise((resolve) => (resolveFirst = resolve)) : Promise.resolve(emptySets),
    );
    render(<ViewerSync />);

    act(() => useAuthStore.setState({ user: USER_2 }));
    await act(async () => {
      resolveFirst({ ...emptySets, blocked: ["author-01"] });
    });

    expect(usePostStore.getState().excludedAuthors).toEqual({});
  });
});


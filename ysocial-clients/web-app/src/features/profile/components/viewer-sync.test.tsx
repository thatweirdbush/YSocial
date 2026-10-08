import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAuthStore } from "@/features/auth";
import * as store from "../store/user-store";
import { ViewerSync } from "./viewer-sync";

const DEMO = { id: "1", email: "member@ysocial.dev", username: "ysocial_member", displayName: "YSocial Member" };

describe("ViewerSync", () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    store.resetUserStore();
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

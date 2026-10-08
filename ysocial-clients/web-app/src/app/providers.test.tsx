import { render } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAuthStore } from "@/features/auth";
import { Providers } from "./providers";

const USER = { id: "1", email: "member@ysocial.dev", username: "ysocial_member" };

describe("Providers", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }));
    localStorage.setItem("ysocial_user", JSON.stringify(USER));
    localStorage.setItem("ysocial_access_token", "a");
    localStorage.setItem("ysocial_refresh_token", "r");
    useAuthStore.setState({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false, hydrated: false });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useAuthStore.getState().actions.clearAuth();
  });

  it("hydrates auth before children effects read the identity", () => {
    const seen: Array<{ hydrated: boolean; id: string | undefined }> = [];
    function Probe() {
      useEffect(() => {
        const { hydrated, user } = useAuthStore.getState();
        seen.push({ hydrated, id: user?.id });
      }, []);
      return null;
    }

    render(
      <Providers>
        <Probe />
      </Providers>,
    );

    expect(seen[0]).toEqual({ hydrated: true, id: "1" });
  });
});

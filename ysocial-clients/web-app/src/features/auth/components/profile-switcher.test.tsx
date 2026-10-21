import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { __clearResourceCache } from "@/hooks/use-cached-resource";
import { ApiError } from "@/lib/api-error";
import { setRealSlices } from "@/test/api-test-utils";
import { SwitchInProgressError, SwitchSessionLostError, SwitchUnconfirmedError } from "../services/switch-profile";
import { useAuthStore } from "../store/auth-store";
import type { MeDto, ProfileSummary } from "../types";
import { ProfileSwitcher } from "./profile-switcher";

const service = vi.hoisted(() => ({ fetchMe: vi.fn(), switchProfile: vi.fn() }));
vi.mock("../services/auth-service", () => ({ fetchMe: service.fetchMe, authService: { switchProfile: service.switchProfile } }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/" }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const MAIN: ProfileSummary = { id: "p-main", username: "main_user", displayName: "Main User", avatarUrl: null, isDefault: true };
const ALT: ProfileSummary = { id: "p-alt", username: "alt_user", displayName: "Alt User", avatarUrl: null, isDefault: false };
const me = (profiles: ProfileSummary[]): MeDto => ({ email: "real@ysocial.dev", profile: { id: "p-main" } as MeDto["profile"], profiles });

const renderMenu = () =>
  render(
    <DropdownMenu open>
      <DropdownMenuTrigger>menu</DropdownMenuTrigger>
      <DropdownMenuContent>
        <ProfileSwitcher />
      </DropdownMenuContent>
    </DropdownMenu>,
  );
const altItem = () => screen.findByRole("menuitem", { name: /Alt User/ });

beforeEach(() => {
  __clearResourceCache();
  setRealSlices("auth");
  service.fetchMe.mockReset().mockResolvedValue(me([MAIN, ALT]));
  service.switchProfile.mockReset().mockResolvedValue({ id: "p-alt", email: "real@ysocial.dev" });
  router.push.mockClear();
  router.refresh.mockClear();
  toast.error.mockClear();
  useAuthStore.setState({ user: { id: "p-main", email: "real@ysocial.dev", username: "main_user" }, hydrated: true });
});

describe("ProfileSwitcher", () => {
  it("lists only the OTHER profiles of the account", async () => {
    renderMenu();

    expect(await altItem()).toBeInTheDocument();
    expect(screen.getByText("Chuyển hồ sơ")).toBeInTheDocument();
    expect(screen.getByText("@alt_user")).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Main User/ })).toBeNull();
  });

  it("is hidden when the account has a single profile", async () => {
    service.fetchMe.mockResolvedValue(me([MAIN]));
    renderMenu();

    await waitFor(() => expect(service.fetchMe).toHaveBeenCalled());

    expect(screen.queryByText("Chuyển hồ sơ")).toBeNull();
    expect(screen.queryByRole("menuitem")).toBeNull();
  });

  it("mock mode: hidden and no request is made", () => {
    setRealSlices("");

    renderMenu();

    expect(screen.queryByText("Chuyển hồ sơ")).toBeNull();
    expect(service.fetchMe).not.toHaveBeenCalled();
  });

  it("a click switches the session and refreshes the route", async () => {
    renderMenu();

    await userEvent.click(await altItem());

    expect(service.switchProfile).toHaveBeenCalledWith(ALT);
    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("a double click sends one request", async () => {
    service.switchProfile.mockReturnValue(new Promise(() => undefined));
    renderMenu();

    await userEvent.dblClick(await altItem());

    expect(service.switchProfile).toHaveBeenCalledTimes(1);
  });

  it("another switch still running is ignored silently", async () => {
    service.switchProfile.mockRejectedValue(new SwitchInProgressError());
    renderMenu();

    await userEvent.click(await altItem());
    await act(async () => undefined);

    expect(toast.error).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it.each([
    ["session lost", new SwitchSessionLostError(), "Phiên đã hết hiệu lực, vui lòng đăng nhập lại", "/login"],
    ["unconfirmed", new SwitchUnconfirmedError(), "Chưa xác nhận được việc chuyển; nếu bị đăng xuất hãy đăng nhập lại", null],
    ["refused profile", new ApiError({ kind: "http", status: 403, code: "ProfileNotOwned" }), "Không chuyển được hồ sơ", null],
    ["anything else", new Error("boom"), "Không chuyển được hồ sơ", null],
  ])("%s: toasts the matching message", async (_name, error, message, redirect) => {
    service.switchProfile.mockRejectedValue(error);
    renderMenu();

    await userEvent.click(await altItem());

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(message));
    expect(router.refresh).not.toHaveBeenCalled();
    if (redirect) expect(router.push).toHaveBeenCalledWith(redirect);
    else expect(router.push).not.toHaveBeenCalled();
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mockFetchSequence, problem, setRealSlices, type MockStep } from "@/test/api-test-utils";
import { useAuthStore } from "../store/auth-store";
import { LoginForm } from "./login-form";

const { push, toastSuccess } = vi.hoisted(() => ({ push: vi.fn(), toastSuccess: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: vi.fn() } }));

function useFetch(steps: MockStep[]) {
  const fake = mockFetchSequence(steps);
  vi.stubGlobal("fetch", fake.fetchFn);
  return fake.calls;
}

const field = (container: HTMLElement, selector: string) => {
  const input = container.querySelector<HTMLInputElement>(selector);
  expect(input).not.toBeNull();
  return input as HTMLInputElement;
};

async function toPasswordStep(user: ReturnType<typeof userEvent.setup>, container: HTMLElement) {
  await user.type(screen.getByRole("textbox"), "real@ysocial.dev{Enter}");
  await waitFor(() => field(container, "input[type=password]"));
}

beforeEach(() => {
  setRealSlices("auth");
  localStorage.clear();
  useAuthStore.getState().actions.clearAuth();
  push.mockClear();
  toastSuccess.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe("LoginForm (real BE)", () => {
  it("shows invalidCredentials message on 401", async () => {
    useFetch([problem(401, "InvalidCredentials")]);
    const user = userEvent.setup();
    const { container } = render(<LoginForm />);
    await toPasswordStep(user, container);

    await user.type(field(container, "input[type=password]"), "wrongpw{Enter}");

    expect(await screen.findByText("Tài khoản hoặc mật khẩu không đúng")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("keeps submit enabled & spinner while pending, ignores re-submit", async () => {
    const fetchSpy = vi.fn(() => new Promise<Response>(() => undefined));
    vi.stubGlobal("fetch", fetchSpy);
    const user = userEvent.setup();
    const { container } = render(<LoginForm />);
    await toPasswordStep(user, container);

    await user.type(field(container, "input[type=password]"), "secret1{Enter}");

    const submit = await screen.findByRole("button", { name: /Đang đăng nhập/i });
    expect(submit).toBeEnabled();
    await user.click(submit);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("success bootstraps the viewer & navigates home", async () => {
    useFetch([
      { status: 200, body: { accessToken: "A1", refreshToken: "R1", refreshTokenExpiry: "2030-01-01T00:00:00Z" } },
      {
        status: 200,
        body: { email: "real@ysocial.dev", profile: { id: "0b8f1c52-6a3e-4c53-9b42-5f9d6f7a1e10", username: "real_user" } },
      },
    ]);
    const user = userEvent.setup();
    const { container } = render(<LoginForm />);
    await toPasswordStep(user, container);

    await user.type(field(container, "input[type=password]"), "secret1{Enter}");

    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    expect(useAuthStore.getState().user?.username).toBe("real_user");
  });

  it("forgot step shows otp errors inline", async () => {
    useFetch([{ status: 204 }, problem(400, "InvalidOtp")]);
    const user = userEvent.setup();
    const { container } = render(<LoginForm />);
    await toPasswordStep(user, container);

    await user.click(screen.getByRole("button", { name: /quên mật khẩu/i }));
    await user.click(await screen.findByRole("button", { name: /gửi/i }));
    await waitFor(() => field(container, "input[maxlength='6']"));

    await user.type(field(container, "input[maxlength='6']"), "123456");
    await user.type(field(container, "input[name=newPassword]"), "newpass1");
    await user.type(field(container, "input[name=confirmNewPassword]"), "newpass1{Enter}");

    expect(await screen.findByText("Mã OTP không đúng hoặc đã hết hạn")).toBeInTheDocument();
  });
});

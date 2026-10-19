import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mockFetchSequence, problem, setRealSlices, type MockStep } from "@/test/api-test-utils";
import { useAuthStore } from "../store/auth-store";
import { RegisterForm } from "./register-form";

const { push, toastSuccess } = vi.hoisted(() => ({ push: vi.fn(), toastSuccess: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: vi.fn() } }));

function useFetch(steps: MockStep[]) {
  const fake = mockFetchSequence(steps);
  vi.stubGlobal("fetch", fake.fetchFn);
  return fake.calls;
}

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>, container: HTMLElement) {
  const type = (name: string, value: string) =>
    user.type(container.querySelector(`input[name=${name}]`) as HTMLInputElement, value);
  await type("email", "new@ysocial.dev");
  await type("username", "new_user");
  await type("password", "secret1");
  await type("confirmPassword", "secret1{Enter}");
}

beforeEach(() => {
  setRealSlices("auth");
  localStorage.clear();
  useAuthStore.getState().actions.clearAuth();
  push.mockClear();
  toastSuccess.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe("RegisterForm (real BE)", () => {
  it("shows usernameTaken on 409", async () => {
    useFetch([problem(409, "UsernameTaken")]);
    const user = userEvent.setup();
    const { container } = render(<RegisterForm />);
    await fillAndSubmit(user, container);
    expect(await screen.findByText("Tên tài khoản này đã được sử dụng.")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("shows emailTaken on 409", async () => {
    useFetch([problem(409, "EmailTaken")]);
    const user = userEvent.setup();
    const { container } = render(<RegisterForm />);
    await fillAndSubmit(user, container);
    expect(await screen.findByText("Email này đã được đăng ký")).toBeInTheDocument();
  });

  it("maps BE validation errors to fields", async () => {
    useFetch([problem(400, "ValidationFailed", { errors: { Email: ["Email rejected by BE"] } })]);
    const user = userEvent.setup();
    const { container } = render(<RegisterForm />);
    await fillAndSubmit(user, container);
    expect(await screen.findByText("Email rejected by BE")).toBeInTheDocument();
  });

  it("register-then-login-failure navigates /login with notice", async () => {
    useFetch([{ status: 201, body: { accountId: "acc" } }, problem(500, "InternalError")]);
    const user = userEvent.setup();
    const { container } = render(<RegisterForm />);
    await fillAndSubmit(user, container);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/login"));
    expect(toastSuccess).toHaveBeenCalledWith("Tạo tài khoản thành công, hãy đăng nhập");
  });

  it("success auto-logs in & navigates home", async () => {
    useFetch([
      { status: 201, body: { accountId: "acc" } },
      { status: 200, body: { accessToken: "A1", refreshToken: "R1", refreshTokenExpiry: "2030-01-01T00:00:00Z" } },
      { status: 200, body: { email: "new@ysocial.dev", profile: { id: "0b8f1c52-6a3e-4c53-9b42-5f9d6f7a1e10", username: "new_user" } } },
    ]);
    const user = userEvent.setup();
    const { container } = render(<RegisterForm />);
    await fillAndSubmit(user, container);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it("keeps submit enabled while pending & ignores re-submit", async () => {
    const fetchSpy = vi.fn(() => new Promise<Response>(() => undefined));
    vi.stubGlobal("fetch", fetchSpy);
    const user = userEvent.setup();
    const { container } = render(<RegisterForm />);
    await fillAndSubmit(user, container);
    const submit = await screen.findByRole("button", { name: /Đang/i });
    expect(submit).toBeEnabled();
    await user.click(submit);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SEED_DEMO_ACCOUNT } from "@/mocks/seed-authors";
import { useAuthStore } from "../store/auth-store";
import { LoginForm } from "./login-form";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe("LoginForm (mock login, spec D10)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    useAuthStore.getState().actions.clearAuth();
  });

  afterEach(() => {
    vi.useRealTimers();
    useAuthStore.getState().actions.clearAuth();
  });

  it("always signs in the seed demo account regardless of the typed identity", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { container } = render(<LoginForm />);

    await user.type(screen.getByRole("textbox"), "someone@else.com{Enter}");
    await act(() => vi.advanceTimersByTimeAsync(900));
    const password = await vi.waitFor(() => {
      const input = container.querySelector<HTMLInputElement>("input[type=password]");
      expect(input).not.toBeNull();
      return input as HTMLInputElement;
    });
    await user.type(password, "secret123{Enter}");
    await act(() => vi.advanceTimersByTimeAsync(1300));

    await vi.waitFor(() => expect(useAuthStore.getState().user).not.toBeNull());
    expect(useAuthStore.getState().user).toMatchObject({
      id: SEED_DEMO_ACCOUNT.id,
      username: SEED_DEMO_ACCOUNT.username,
    });
  });
});

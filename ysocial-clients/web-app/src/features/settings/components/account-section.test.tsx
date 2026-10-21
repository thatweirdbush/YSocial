import type { MeDto } from "@/features/auth";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setRealSlices } from "@/test/api-test-utils";
import { maxBirthDate } from "../utils/birth-date";
import { AccountSection } from "./account-section";

const service = vi.hoisted(() => ({ fetchMe: vi.fn(), saveAccountProfile: vi.fn() }));
vi.mock("@/features/auth/services/auth-service", () => ({ fetchMe: service.fetchMe }));
vi.mock("../services/account-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/account-service")>()),
  saveAccountProfile: service.saveAccountProfile,
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const me: MeDto = {
  email: "real@ysocial.dev",
  gender: "female",
  dateOfBirth: "1999-05-20",
  profile: { id: "p1", username: "real_user", displayName: "Real User", bio: null, avatarUrl: null, coverUrl: null } as MeDto["profile"],
  profiles: [],
};

const birthDate = () => screen.getByLabelText("Ngày sinh") as HTMLInputElement;
const saveButton = () => screen.getByRole("button", { name: "Lưu" });

beforeEach(() => {
  setRealSlices(undefined);
  service.fetchMe.mockReset().mockResolvedValue(me);
  service.saveAccountProfile.mockReset().mockResolvedValue({});
  toast.success.mockClear();
  toast.error.mockClear();
});

describe("AccountSection", () => {
  it("prefills the form from GET me: email & username read-only, gender & birth date editable", async () => {
    render(<AccountSection />);

    expect(await screen.findByDisplayValue("real@ysocial.dev")).toHaveAttribute("readonly");
    expect(screen.getByDisplayValue("real_user")).toHaveAttribute("readonly");
    expect(screen.getByText("Không thể đổi")).toBeInTheDocument();
    expect(screen.getByLabelText("Giới tính")).toHaveValue("female");
    expect(birthDate()).toHaveValue("1999-05-20");
  });

  it("limits the birth date to yesterday", async () => {
    render(<AccountSection />);
    await screen.findByLabelText("Ngày sinh");

    expect(birthDate()).toHaveAttribute("max", maxBirthDate());
  });

  it("saves the changed fields, toasts & keeps the button enabled", async () => {
    const user = userEvent.setup();
    render(<AccountSection />);
    await screen.findByLabelText("Giới tính");

    await user.selectOptions(screen.getByLabelText("Giới tính"), "male");
    await user.click(saveButton());

    await waitFor(() => expect(service.saveAccountProfile).toHaveBeenCalledWith(me, { gender: "male", dateOfBirth: "1999-05-20" }));
    expect(toast.success).toHaveBeenCalledWith("Đã lưu");
    expect(saveButton()).toBeEnabled();
  });

  it("double click sends one request while the first is pending", async () => {
    let finish: () => void = () => undefined;
    service.saveAccountProfile.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    render(<AccountSection />);
    await screen.findByLabelText("Giới tính");

    await user.click(saveButton());
    await user.click(saveButton());

    expect(service.saveAccountProfile).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
  });

  it("a future birth date shows an error and sends nothing", async () => {
    const user = userEvent.setup();
    render(<AccountSection />);
    await screen.findByLabelText("Ngày sinh");

    await user.clear(birthDate());
    await user.type(birthDate(), "2999-01-01");
    await user.click(saveButton());

    const error = await screen.findByText("Ngày sinh không hợp lệ");
    expect(birthDate()).toHaveAttribute("aria-describedby", error.id);
    expect(error.id).not.toBe("");
    expect(service.saveAccountProfile).not.toHaveBeenCalled();
  });

  it("a failed save toasts the error and keeps the form", async () => {
    service.saveAccountProfile.mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    render(<AccountSection />);
    await screen.findByLabelText("Giới tính");

    await user.click(saveButton());

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Không lưu được"));
    expect(saveButton()).toBeEnabled();
  });

  it("offers a retry when GET me fails", async () => {
    service.fetchMe.mockRejectedValueOnce(new Error("offline"));
    const user = userEvent.setup();
    render(<AccountSection />);

    await user.click(await screen.findByRole("button", { name: "Thử lại" }));

    expect(await screen.findByDisplayValue("real@ysocial.dev")).toBeInTheDocument();
  });

  it("mock mode: shows the unavailable state & makes no request", () => {
    setRealSlices("");

    render(<AccountSection />);

    expect(screen.getByText("Tính năng này chưa khả dụng")).toBeInTheDocument();
    expect(service.fetchMe).not.toHaveBeenCalled();
  });
});

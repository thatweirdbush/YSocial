import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetSettingsStore, useSettingsStore } from "../store/settings-store";
import { AppearanceSection } from "./appearance-section";

const theme = vi.hoisted(() => ({ setTheme: vi.fn(), current: "dark" }));
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: theme.current, setTheme: theme.setTheme }) }));

beforeEach(() => {
  theme.setTheme.mockClear();
  theme.current = "dark";
  resetSettingsStore();
});

describe("AppearanceSection", () => {
  it("heads the page and says the choices apply to this device only", () => {
    render(<AppearanceSection />);

    expect(screen.getByRole("heading", { level: 1, name: "Giao diện" })).toBeInTheDocument();
    expect(screen.getByText("Chỉ áp dụng trên thiết bị này")).toBeInTheDocument();
  });

  it("marks the current theme & calls setTheme for light / dark / system", async () => {
    render(<AppearanceSection />);
    expect(screen.getByRole("radio", { name: "Tối" })).toBeChecked();

    await userEvent.click(screen.getByRole("radio", { name: "Sáng" }));
    await userEvent.click(screen.getAllByRole("radio", { name: "Theo hệ thống" })[0]);

    expect(theme.setTheme).toHaveBeenNthCalledWith(1, "light");
    expect(theme.setTheme).toHaveBeenNthCalledWith(2, "system");
  });

  it("writes font size & reduced motion to the settings store", async () => {
    render(<AppearanceSection />);

    await userEvent.click(screen.getByRole("radio", { name: "Lớn" }));
    await userEvent.click(screen.getByRole("radio", { name: "Luôn giảm" }));

    expect(useSettingsStore.getState()).toMatchObject({ fontSize: "lg", reducedMotion: "reduce" });
    expect(screen.getByRole("radio", { name: "Lớn" })).toBeChecked();
  });
});

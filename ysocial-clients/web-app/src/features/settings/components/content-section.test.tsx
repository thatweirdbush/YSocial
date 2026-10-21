import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { setRealSlices } from "@/test/api-test-utils";
import { resetSettingsStore, useSettingsStore } from "../store/settings-store";
import { ContentSection } from "./content-section";

beforeEach(() => {
  resetSettingsStore();
  setRealSlices(undefined);
});

describe("ContentSection", () => {
  it("heads the page and links to the muted accounts", () => {
    render(<ContentSection />);

    expect(screen.getByRole("heading", { level: 1, name: "Nội dung" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Danh sách đã ẩn/ })).toHaveAttribute("href", "/settings/muted");
  });

  it("hides the muted link while the mute capability is off", () => {
    setRealSlices("auth,content");

    render(<ContentSection />);

    expect(screen.queryByRole("link", { name: /Danh sách đã ẩn/ })).toBeNull();
  });

  it("switches write the viewer display preferences (this device only)", async () => {
    render(<ContentSection />);

    await userEvent.click(screen.getByRole("switch", { name: "Ẩn số lượt thích" }));
    await userEvent.click(screen.getByRole("switch", { name: "Ẩn số lượt chia sẻ" }));

    expect(useSettingsStore.getState()).toMatchObject({ hideLikeCounts: true, hideShareCounts: true });
    expect(screen.getByText("Chỉ áp dụng trên thiết bị này")).toBeInTheDocument();
  });

  it("reflects the stored values", () => {
    useSettingsStore.getState().actions.setHideLikeCounts(true);

    render(<ContentSection />);

    expect(screen.getByRole("switch", { name: "Ẩn số lượt thích" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Ẩn số lượt chia sẻ" })).not.toBeChecked();
  });
});

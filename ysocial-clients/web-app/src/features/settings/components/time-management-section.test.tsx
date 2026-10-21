import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { localDateKey, USAGE_STORAGE_KEY } from "../utils/usage-tracker";
import { TimeManagementSection } from "./time-management-section";

const DAY = 86_400_000;

beforeEach(() => localStorage.removeItem(USAGE_STORAGE_KEY));

describe("TimeManagementSection", () => {
  it("shows an empty state & says the data lives on this device when nothing was recorded", () => {
    render(<TimeManagementSection />);

    expect(screen.getByRole("heading", { level: 1, name: "Quản lý thời gian" })).toBeInTheDocument();
    expect(screen.getByText("Chưa có dữ liệu")).toBeInTheDocument();
    expect(screen.getByText("Chỉ áp dụng trên thiết bị này")).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("renders today, 7 daily rows and the 7-day average", () => {
    const now = Date.now();
    localStorage.setItem(
      USAGE_STORAGE_KEY,
      JSON.stringify({ [localDateKey(now)]: 3_900, [localDateKey(now - DAY)]: 600, [localDateKey(now - 2 * DAY)]: 1_500 }),
    );

    render(<TimeManagementSection />);

    expect(screen.getByText("Hôm nay")).toBeInTheDocument();
    expect(screen.getByText("1h 05m", { selector: "[data-slot='usage-today']" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(7);
    expect(within(screen.getAllByRole("listitem")[6]).getByText("1h 05m")).toBeInTheDocument();
    // (3900 + 600 + 1500) / 7 = 857s
    expect(screen.getByText("Trung bình 7 ngày")).toBeInTheDocument();
    expect(screen.getByText("14m", { selector: "[data-slot='usage-average']" })).toBeInTheDocument();
  });
});

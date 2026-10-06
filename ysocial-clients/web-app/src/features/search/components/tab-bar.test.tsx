import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TabBar } from "./tab-bar";

const tabs = [
  { value: "a", label: "A" },
  { value: "b", label: "B" },
  { value: "c", label: "C" },
] as const;

describe("TabBar", () => {
  it("uses a roving tabindex and moves selection with arrow keys", async () => {
    const onChange = vi.fn();
    const { rerender } = render(<TabBar tabs={tabs} active="a" onChange={onChange} label="Tabs" panelId="panel" />);

    expect(screen.getByRole("tab", { name: "A" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: "B" })).toHaveAttribute("tabindex", "-1");

    screen.getByRole("tab", { name: "A" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "B" })).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith("b");

    rerender(<TabBar tabs={tabs} active="b" onChange={onChange} label="Tabs" panelId="panel" />);
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(onChange).toHaveBeenLastCalledWith("c");
    await userEvent.keyboard("{Home}");
    expect(onChange).toHaveBeenLastCalledWith("a");
  });

  it("points every tab at the shared panel", () => {
    render(<TabBar tabs={tabs} active="a" onChange={() => {}} label="Tabs" panelId="panel" />);

    for (const tab of screen.getAllByRole("tab")) expect(tab).toHaveAttribute("aria-controls", "panel");
  });
});

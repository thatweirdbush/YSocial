import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useUIStore } from "@/lib/store/ui-store";
import { LanguageSection } from "./language-section";

beforeEach(() => {
  localStorage.removeItem("ysocial_locale");
  useUIStore.setState({ locale: "vi" });
});

describe("LanguageSection", () => {
  it("shows the current language as selected", () => {
    render(<LanguageSection />);

    expect(screen.getByRole("heading", { level: 1, name: "Ngôn ngữ" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Tiếng Việt" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "English" })).not.toBeChecked();
  });

  it("switches the ui-store locale (the only locale owner) & the page re-translates", async () => {
    render(<LanguageSection />);

    await userEvent.click(screen.getByRole("radio", { name: "English" }));

    expect(useUIStore.getState().locale).toBe("en");
    expect(localStorage.getItem("ysocial_locale")).toBe("en");
    expect(screen.getByRole("heading", { level: 1, name: "Language" })).toBeInTheDocument();
  });
});

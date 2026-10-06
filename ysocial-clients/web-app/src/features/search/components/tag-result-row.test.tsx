import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useUIStore } from "@/lib/store/ui-store";
import { TagResultRow } from "./tag-result-row";

afterEach(() => useUIStore.getState().actions.setLocale("vi"));

describe("TagResultRow plurals", () => {
  it("uses the singular form for one post in English", () => {
    useUIStore.getState().actions.setLocale("en");
    render(<TagResultRow stat={{ tag: "Zustand", postsCount: 1 }} />);

    expect(screen.getByText("1 post")).toBeInTheDocument();
  });

  it("uses the plural form otherwise", () => {
    useUIStore.getState().actions.setLocale("en");
    render(<TagResultRow stat={{ tag: "NextJS", postsCount: 3 }} />);

    expect(screen.getByText("3 posts")).toBeInTheDocument();
  });
});

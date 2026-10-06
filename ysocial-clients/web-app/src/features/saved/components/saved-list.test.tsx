import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { getMockPostById } from "@/features/posts";
import { SavedList } from "./saved-list";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push, back: vi.fn() }),
}));

describe("SavedList", () => {
  it("links every saved card to an existing thread", async () => {
    render(<SavedList />);

    const commentButtons = screen.getAllByRole("button", { name: "Trả lời" });
    expect(commentButtons.length).toBeGreaterThan(0);
    for (const button of commentButtons) {
      await userEvent.click(button);
    }

    const ids = push.mock.calls.map(([path]) => String(path).replace("/posts/", ""));
    expect(ids).toHaveLength(commentButtons.length);
    for (const id of ids) {
      expect(getMockPostById(id), id).toBeDefined();
    }
  });
});

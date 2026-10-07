import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PostDetailLoading from "./loading";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/components/layout/main-layout", () => ({
  MainLayout: ({ children }: { children: ReactNode }) => children,
}));

describe("PostDetailLoading", () => {
  it("renders the sticky header so it does not pop in when the thread loads", () => {
    render(<PostDetailLoading />);

    expect(screen.getByRole("button", { name: "Quay lại" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Thread" })).toBeInTheDocument();
  });
});

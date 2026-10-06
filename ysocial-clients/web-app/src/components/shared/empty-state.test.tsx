import { render, screen } from "@testing-library/react";
import { Sparkles } from "lucide-react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  it("renders title, description and action", () => {
    render(
      <EmptyState
        icon={Sparkles}
        title="Chưa có gì"
        description="Hãy đăng bài đầu tiên"
        action={<button type="button">Tạo bài viết</button>}
      />,
    );

    expect(screen.getByRole("heading", { name: "Chưa có gì" })).toBeInTheDocument();
    expect(screen.getByText("Hãy đăng bài đầu tiên")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tạo bài viết" })).toBeInTheDocument();
  });

  it("hides the decorative icon from assistive tech", () => {
    const { container } = render(<EmptyState icon={Sparkles} title="Trống" />);

    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});

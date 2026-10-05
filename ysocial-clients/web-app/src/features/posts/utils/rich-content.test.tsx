import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RichContent } from "./rich-content";

const content = "Sáng nay #ĐàLạt cùng @anquoc.dev";

describe("RichContent", () => {
  it("turns hashtags and mentions into links", () => {
    render(<RichContent content={content} />);

    expect(screen.getByRole("link", { name: "#ĐàLạt" })).toHaveAttribute("href", "/tags/%C4%90%C3%A0L%E1%BA%A1t");
    expect(screen.getByRole("link", { name: "@anquoc.dev" })).toHaveAttribute("href", "/@anquoc.dev");
  });

  it("does not bubble link clicks to the parent", async () => {
    const onParentClick = vi.fn();
    render(
      <div onClick={onParentClick}>
        <RichContent content={content} />
      </div>,
    );

    await userEvent.click(screen.getByRole("link", { name: "#ĐàLạt" }));

    expect(onParentClick).not.toHaveBeenCalled();
  });

  it("highlights tokens in text segments", () => {
    const { container } = render(<RichContent content={content} highlightTokens={["sang"]} />);

    expect(container.querySelector("mark")).toHaveTextContent("Sáng");
  });

  it("never highlights inside links", () => {
    render(<RichContent content={content} highlightTokens={["dalat"]} />);

    expect(screen.getByRole("link", { name: "#ĐàLạt" }).querySelector("mark")).toBeNull();
  });

  it("ignores emails and inline # characters", () => {
    render(<RichContent content="mail a@b.com or c#d" />);

    expect(screen.queryByRole("link")).toBeNull();
  });
});

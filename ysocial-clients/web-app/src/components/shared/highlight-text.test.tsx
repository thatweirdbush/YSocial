import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HighlightText } from "./highlight-text";

const marks = (container: HTMLElement) => Array.from(container.querySelectorAll("mark")).map((mark) => mark.textContent);

describe("HighlightText", () => {
  it("marks diacritics-insensitive matches with original text", () => {
    const { container } = render(<HighlightText text="Bình minh ở Đà Lạt" tokens={["da", "lat"]} />);

    expect(marks(container)).toEqual(["Đà", "Lạt"]);
    expect(container.textContent).toBe("Bình minh ở Đà Lạt");
  });

  it("renders plain text without tokens", () => {
    const { container } = render(<HighlightText text="Xin chào" tokens={[]} />);

    expect(container.querySelector("mark")).toBeNull();
    expect(container.textContent).toBe("Xin chào");
  });

  it("treats regex characters literally", () => {
    const { container } = render(<HighlightText text="I love c++ (really)" tokens={["c++", "("]} />);

    expect(marks(container)).toEqual(["c++", "("]);
  });
});

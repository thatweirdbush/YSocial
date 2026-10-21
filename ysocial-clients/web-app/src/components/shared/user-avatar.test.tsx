import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { UserAvatar } from "./user-avatar";

// alt="" makes the picture presentational (no img role): query the element itself
const img = (container: HTMLElement) => container.querySelector("img");

describe("UserAvatar", () => {
  it("shows the initial underneath when there is no image", () => {
    const { container } = render(<UserAvatar name="linh nguyen" src={undefined} />);

    expect(screen.getByText("L")).toBeInTheDocument();
    expect(img(container)).toBeNull();
  });

  it("uses the fallback character for a blank name", () => {
    render(<UserAvatar name="  " />);

    expect(screen.getByText("U")).toBeInTheDocument();
  });

  it("keeps the initial under the image and renders the image on top", () => {
    const { container } = render(<UserAvatar name="Mai" src="https://img.example.com/mai.png" />);

    expect(screen.getByText("M")).toBeInTheDocument();
    expect(img(container)?.getAttribute("src")).toBe("https://img.example.com/mai.png");
  });

  it("hides a broken image and leaves the initial visible", () => {
    const { container } = render(<UserAvatar name="Mai" src="https://img.example.com/broken.png" />);

    fireEvent.error(img(container)!);

    expect(img(container)).toBeNull();
    expect(screen.getByText("M")).toBeInTheDocument();
  });

  it("tries again when the src changes after a failure", () => {
    const { container, rerender } = render(<UserAvatar name="Mai" src="https://img.example.com/broken.png" />);
    fireEvent.error(img(container)!);

    rerender(<UserAvatar name="Mai" src="https://img.example.com/fixed.png" />);

    expect(img(container)?.getAttribute("src")).toBe("https://img.example.com/fixed.png");
  });

  it("optimizes our Cloudinary avatars through the loader", () => {
    const { container } = render(<UserAvatar name="Mai" src="https://res.cloudinary.com/demo/image/upload/v1/ysocial/dev/avatars/a.jpg" />);

    expect(img(container)?.getAttribute("src")).toContain("f_auto,q_auto,c_limit");
  });

  it("applies the sizing class to the avatar root and the fallback class to the initial", () => {
    const { container } = render(<UserAvatar name="Mai" className="size-20" fallbackClassName="text-xl" />);

    expect(container.querySelector("[data-slot=avatar]")).toHaveClass("size-20");
    expect(screen.getByText("M")).toHaveClass("text-xl");
  });
});

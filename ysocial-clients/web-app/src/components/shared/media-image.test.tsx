import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MediaImage } from "./media-image";

const OURS = "https://res.cloudinary.com/demo/image/upload/v1/ysocial/dev/posts/abc.jpg";

describe("MediaImage", () => {
  it("renders our Cloudinary urls through the delivery loader (f_auto, q_auto, c_limit, width)", () => {
    render(<MediaImage src={OURS} alt="ours" width={400} height={300} />);

    const image = screen.getByAltText("ours");
    expect(image.getAttribute("src")).toMatch(/\/upload\/f_auto,q_auto,c_limit,w_\d+\/v1\/ysocial\/dev\/posts\/abc\.jpg$/);
    expect(image.getAttribute("src")).not.toContain("/_next/image");
  });

  it.each([
    ["a blob preview", "blob:http://localhost:3000/1234"],
    ["a data url", "data:image/png;base64,AAAA"],
    ["a giphy gif", "https://media.giphy.com/media/x/giphy.gif"],
    ["another Cloudinary cloud lookalike host", "https://res.cloudinary.com.evil.com/demo/image/upload/a.jpg"],
  ])("renders %s untouched and straight from the browser (never through /_next/image)", (_name, src) => {
    render(<MediaImage src={src} alt="foreign" width={100} height={100} />);

    const image = screen.getByAltText("foreign");
    expect(image.getAttribute("src")).toBe(src);
    expect(image.getAttribute("srcset")).toBeNull();
  });

  it("passes layout props through (fill + sizes)", () => {
    render(
      <div style={{ position: "relative" }}>
        <MediaImage src={OURS} alt="fill" fill sizes="(min-width: 640px) 300px, 100vw" />
      </div>,
    );

    expect(screen.getByAltText("fill").getAttribute("sizes")).toBe("(min-width: 640px) 300px, 100vw");
  });
});

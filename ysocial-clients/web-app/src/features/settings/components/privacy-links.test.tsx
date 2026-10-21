import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { setRealSlices } from "@/test/api-test-utils";
import { PrivacyLinks } from "./privacy-links";

beforeEach(() => setRealSlices(undefined));

describe("PrivacyLinks", () => {
  it("links to the blocked list and close friends", () => {
    render(<PrivacyLinks />);

    expect(screen.getByRole("link", { name: "Đã chặn" })).toHaveAttribute("href", "/settings/blocked");
    expect(screen.getByRole("link", { name: "Bạn thân" })).toHaveAttribute("href", "/settings/close-friends");
  });

  it("hides every link (and the group) while their capabilities are off", () => {
    setRealSlices("auth,content");

    const { container } = render(<PrivacyLinks />);

    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(container).toBeEmptyDOMElement();
  });
});

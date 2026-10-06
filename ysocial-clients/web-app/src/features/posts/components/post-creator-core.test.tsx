import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PostCreatorCore } from "./post-creator-core";

const AUDIENCE_LABEL = "Mọi người có thể phản hồi";
const DRAFTS_TITLE = "Bản nháp";

describe("PostCreatorCore modes", () => {
  it("shows audience and drafts pickers in post mode", () => {
    render(<PostCreatorCore />);

    expect(screen.getByRole("button", { name: AUDIENCE_LABEL })).toBeInTheDocument();
    expect(screen.getByTitle(DRAFTS_TITLE)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đăng" })).toBeInTheDocument();
  });

  it("hides audience and drafts pickers and uses the custom placeholder in reply mode", () => {
    render(<PostCreatorCore mode="reply" placeholder="Trả lời @minh…" />);

    expect(screen.getByPlaceholderText("Trả lời @minh…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: AUDIENCE_LABEL })).not.toBeInTheDocument();
    expect(screen.queryByTitle(DRAFTS_TITLE)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Trả lời" })).toBeInTheDocument();
  });
});

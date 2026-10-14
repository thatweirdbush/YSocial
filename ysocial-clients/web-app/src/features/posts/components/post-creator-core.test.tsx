import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth/store/auth-store";
import { useDraftStore } from "../store/post-draft-store";
import { PostCreatorCore, type PostCreatorCoreRef } from "./post-creator-core";

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

describe("PostCreatorCore close friends visibility", () => {
  const CHIP = "Chỉ bạn thân";

  beforeEach(() => {
    useAuthStore.setState({ user: { id: "1", email: "member@ysocial.dev" } });
    useDraftStore.setState({ drafts: [] });
  });

  afterEach(() => {
    useAuthStore.setState({ user: null });
  });

  it("offers a close friends chip to a signed-in author, off by default", () => {
    render(<PostCreatorCore />);

    expect(screen.getByRole("button", { name: CHIP })).toHaveAttribute("aria-pressed", "false");
  });

  it("hides the chip for a guest and in reply mode", () => {
    const { unmount } = render(<PostCreatorCore mode="reply" />);
    expect(screen.queryByRole("button", { name: CHIP })).toBeNull();
    unmount();

    useAuthStore.setState({ user: null });
    render(<PostCreatorCore />);
    expect(screen.queryByRole("button", { name: CHIP })).toBeNull();
  });

  it("submits public by default", async () => {
    const onPostSubmitted = vi.fn().mockResolvedValue(undefined);
    render(<PostCreatorCore onPostSubmitted={onPostSubmitted} />);

    await userEvent.type(screen.getByRole("textbox"), "xin chào");
    await userEvent.click(screen.getByRole("button", { name: "Đăng" }));

    await waitFor(() => expect(onPostSubmitted).toHaveBeenCalledWith("xin chào", [], "anyone", "public"));
  });

  it("submits closeFriends when the chip is on, then resets it to public", async () => {
    const onPostSubmitted = vi.fn().mockResolvedValue(undefined);
    render(<PostCreatorCore onPostSubmitted={onPostSubmitted} />);

    await userEvent.click(screen.getByRole("button", { name: CHIP }));
    expect(screen.getByRole("button", { name: CHIP })).toHaveAttribute("aria-pressed", "true");
    await userEvent.type(screen.getByRole("textbox"), "chỉ bạn thân thấy");
    await userEvent.click(screen.getByRole("button", { name: "Đăng" }));

    await waitFor(() => expect(onPostSubmitted).toHaveBeenCalledWith("chỉ bạn thân thấy", [], "anyone", "closeFriends"));
    await waitFor(() => expect(screen.getByRole("button", { name: CHIP })).toHaveAttribute("aria-pressed", "false"));
  });

  it("turns the chip off again on a second click", async () => {
    render(<PostCreatorCore />);

    await userEvent.click(screen.getByRole("button", { name: CHIP }));
    await userEvent.click(screen.getByRole("button", { name: CHIP }));

    expect(screen.getByRole("button", { name: CHIP })).toHaveAttribute("aria-pressed", "false");
  });

  it("restores the visibility a draft was saved with", async () => {
    useDraftStore.getState().actions.saveDraft("bản nháp bạn thân", [], "anyone", undefined, "closeFriends");
    render(<PostCreatorCore />);

    await userEvent.click(screen.getByTitle("Bản nháp"));
    await userEvent.click(await screen.findByRole("button", { name: "Khôi phục" }));

    expect(screen.getByRole("textbox")).toHaveValue("bản nháp bạn thân");
    expect(screen.getByRole("button", { name: CHIP })).toHaveAttribute("aria-pressed", "true");
  });

  it("restores a draft without visibility as public, even if the chip was on", async () => {
    useDraftStore.getState().actions.saveDraft("bản nháp cũ", [], "anyone");
    render(<PostCreatorCore />);
    await userEvent.click(screen.getByRole("button", { name: CHIP }));

    await userEvent.click(screen.getByTitle("Bản nháp"));
    await userEvent.click(await screen.findByRole("button", { name: "Khôi phục" }));

    expect(screen.getByRole("textbox")).toHaveValue("bản nháp cũ");
    expect(screen.getByRole("button", { name: CHIP })).toHaveAttribute("aria-pressed", "false");
  });

  it("saves the current visibility into the draft", async () => {
    render(<PostCreatorCore />);
    await userEvent.click(screen.getByRole("button", { name: CHIP }));
    await userEvent.type(screen.getByRole("textbox"), "nháp riêng");

    await userEvent.click(screen.getByTitle("Bản nháp"));
    await userEvent.click(await screen.findByRole("button", { name: "Lưu bản nháp" }));

    expect(useDraftStore.getState().drafts[0]).toMatchObject({ content: "nháp riêng", visibility: "closeFriends" });
  });
});

describe("PostCreatorCore closing from the discard warning", () => {
  const CHIP = "Chỉ bạn thân";

  beforeEach(() => {
    useAuthStore.setState({ user: { id: "1", email: "member@ysocial.dev" } });
    useDraftStore.setState({ drafts: [] });
  });

  afterEach(() => {
    useAuthStore.setState({ user: null });
  });

  async function closeWith(choice: string) {
    const ref = createRef<PostCreatorCoreRef>();
    render(<PostCreatorCore ref={ref} onCancel={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: CHIP }));
    await userEvent.type(screen.getByRole("textbox"), "nội dung");
    act(() => ref.current?.triggerClose());
    await userEvent.click(await screen.findByRole("button", { name: choice }));
  }

  it("resets the visibility after save and close", async () => {
    await closeWith("Lưu bản nháp");

    expect(useDraftStore.getState().drafts[0]).toMatchObject({ visibility: "closeFriends" });
    expect(screen.getByRole("button", { name: CHIP })).toHaveAttribute("aria-pressed", "false");
  });

  it("resets the visibility after discard", async () => {
    await closeWith("Hủy bỏ");

    expect(screen.getByRole("button", { name: CHIP })).toHaveAttribute("aria-pressed", "false");
  });

  it("starts a new draft after save and close instead of overwriting the closed one", async () => {
    await closeWith("Lưu bản nháp");
    await userEvent.type(screen.getByRole("textbox"), "bài khác");
    await userEvent.click(screen.getByTitle("Bản nháp"));
    await userEvent.click(await screen.findByRole("button", { name: "Lưu bản nháp" }));

    expect(useDraftStore.getState().drafts).toHaveLength(2);
  });
});

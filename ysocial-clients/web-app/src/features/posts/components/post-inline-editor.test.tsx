import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { POST_CONTENT_MAX } from "../utils/post-content";
import { PostInlineEditor } from "./post-inline-editor";

const setup = (props: Partial<React.ComponentProps<typeof PostInlineEditor>> = {}) => {
  const onSave = vi.fn().mockResolvedValue(true);
  const onCancel = vi.fn();
  render(
    <PostInlineEditor initialContent="Xin chào" hasImages={false} disabled={false} onSave={onSave} onCancel={onCancel} {...props} />,
  );
  return { onSave, onCancel, textbox: screen.getByRole("textbox", { name: "Nội dung bài viết" }) };
};

const saveButton = () => screen.getByRole("button", { name: "Lưu" });

describe("PostInlineEditor", () => {
  it("autofocuses with the caret at the end", () => {
    const { textbox } = setup();

    expect(textbox).toHaveFocus();
    expect((textbox as HTMLTextAreaElement).selectionStart).toBe("Xin chào".length);
  });

  it("disables Save while unchanged", async () => {
    const { textbox } = setup();
    expect(saveButton()).toBeDisabled();

    await userEvent.type(textbox, "!");
    expect(saveButton()).toBeEnabled();
  });

  it("disables Save for blank content without images, allows it with images", () => {
    const { textbox } = setup();
    fireEvent.change(textbox, { target: { value: "   " } });
    expect(saveButton()).toBeDisabled();
  });

  it("allows blank content when the post has images", () => {
    const { textbox } = setup({ hasImages: true });
    fireEvent.change(textbox, { target: { value: "   " } });
    expect(saveButton()).toBeEnabled();
  });

  it("disables Save while an owner op is pending", () => {
    const { textbox } = setup({ disabled: true });
    fireEvent.change(textbox, { target: { value: "khác" } });
    expect(saveButton()).toBeDisabled();
  });

  it("shows the counter and blocks content over the limit", () => {
    const { textbox } = setup();
    fireEvent.change(textbox, { target: { value: "a".repeat(POST_CONTENT_MAX) } });
    expect(screen.getByText(`${POST_CONTENT_MAX}/${POST_CONTENT_MAX}`)).toBeInTheDocument();
    expect(saveButton()).toBeEnabled();

    fireEvent.change(textbox, { target: { value: "a".repeat(POST_CONTENT_MAX + 1) } });
    expect(saveButton()).toBeDisabled();
  });

  it("cancels on Escape", async () => {
    const { onCancel } = setup();

    await userEvent.keyboard("{Escape}");

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("saves the trimmed content on Ctrl+Enter", async () => {
    const { textbox, onSave } = setup();
    fireEvent.change(textbox, { target: { value: "  Mới  " } });

    await userEvent.keyboard("{Control>}{Enter}{/Control}");

    expect(onSave).toHaveBeenCalledWith("Mới");
  });

  it("ignores Ctrl+Enter while Save is disabled", async () => {
    const { onSave } = setup();

    await userEvent.keyboard("{Control>}{Enter}{/Control}");

    expect(onSave).not.toHaveBeenCalled();
  });
});

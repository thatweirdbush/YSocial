import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BlockConfirmDialog } from "./block-confirm-dialog";

function renderDialog(overrides: Partial<React.ComponentProps<typeof BlockConfirmDialog>> = {}) {
  const props = { open: true, onOpenChange: vi.fn(), username: "minhthu", onConfirm: vi.fn(), ...overrides };
  render(<BlockConfirmDialog {...props} />);
  return props;
}

describe("BlockConfirmDialog", () => {
  it("asks for confirmation with the username", () => {
    renderDialog();

    expect(screen.getByRole("alertdialog", { name: "Chặn @minhthu?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Chặn" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Huỷ" })).toBeInTheDocument();
  });

  it("confirms without closing on its own (the caller owns the state)", async () => {
    const { onConfirm } = renderDialog();

    await userEvent.click(screen.getByRole("button", { name: "Chặn" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("cancels without confirming", async () => {
    const { onConfirm, onOpenChange } = renderDialog();

    await userEvent.click(screen.getByRole("button", { name: "Huỷ" }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("renders nothing while closed", () => {
    renderDialog({ open: false });

    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

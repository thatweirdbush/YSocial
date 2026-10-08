import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { forwardRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { UserProfile } from "../types";
import { ShareProfileDialog } from "./share-profile-dialog";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

interface CanvasProps {
  imageSettings?: { src: string; crossOrigin?: string };
}
const canvasProps: CanvasProps[] = [];

vi.mock("qrcode.react", () => ({
  QRCodeSVG: () => <svg data-testid="qr-svg" />,
  QRCodeCanvas: forwardRef<HTMLCanvasElement, CanvasProps>(function MockCanvas(props, ref) {
    canvasProps.push(props);
    return <canvas ref={ref} data-testid="qr-canvas" />;
  }),
}));

const user: UserProfile = {
  id: "author-03",
  displayName: "Trần Anh Quốc",
  username: "anquoc.dev",
  avatarUrl: "https://images.unsplash.com/avatar.jpg",
  followersCount: 1,
  followingCount: 1,
  isFollowing: false,
};

const URL_TEXT = "http://localhost:3000/@anquoc.dev";

let writeText: ReturnType<typeof vi.fn>;
let anchorClick: ReturnType<typeof vi.spyOn>;
let downloads: string[];

beforeEach(() => {
  vi.restoreAllMocks();
  Object.values(toast).forEach((mock) => mock.mockClear());
  canvasProps.length = 0;
  downloads = [];
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push(this.download);
  });
});

afterEach(() => {
  vi.useRealTimers();
  anchorClick.mockRestore();
});

const renderDialog = () => render(<ShareProfileDialog open onOpenChange={vi.fn()} user={user} />);

describe("ShareProfileDialog", () => {
  it("renders the QR code and the profile link", () => {
    renderDialog();

    expect(screen.getByTestId("qr-svg")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue(URL_TEXT);
  });

  it("copies the profile link, toasts, and swaps the icon back after 1.5s", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderDialog();
    const button = screen.getByRole("button", { name: "Sao chép liên kết" });

    await act(async () => {
      fireEvent.click(button);
    });

    expect(writeText).toHaveBeenCalledWith(URL_TEXT);
    expect(toast.success).toHaveBeenCalledWith("Đã sao chép liên kết");
    expect(button).toHaveAttribute("data-copied", "true");

    await act(() => vi.advanceTimersByTimeAsync(1600));
    expect(button).toHaveAttribute("data-copied", "false");
  });

  it("toasts and selects the link when the clipboard is denied", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    renderDialog();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sao chép liên kết" }));
    });

    expect(toast.error).toHaveBeenCalledWith("Không sao chép được, hãy copy thủ công");
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input).toHaveFocus();
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(URL_TEXT.length);
  });

  it("downloads the PNG with the avatar embedded using CORS-anonymous loading", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,AAA");
    renderDialog();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Tải PNG" }));
    });

    expect(downloads).toEqual(["ysocial-anquoc.dev-qr.png"]);
    expect(canvasProps.at(-1)?.imageSettings?.crossOrigin).toBe("anonymous");
  });

  it("retries without the avatar when the canvas is tainted (SecurityError)", async () => {
    const toDataURL = vi
      .spyOn(HTMLCanvasElement.prototype, "toDataURL")
      .mockImplementationOnce(() => {
        throw new DOMException("tainted", "SecurityError");
      })
      .mockReturnValue("data:image/png;base64,BBB");
    renderDialog();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Tải PNG" }));
    });

    await waitFor(() => expect(downloads).toEqual(["ysocial-anquoc.dev-qr.png"]));
    expect(toDataURL).toHaveBeenCalledTimes(2);
    expect(canvasProps.at(-1)?.imageSettings).toBeUndefined();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("toasts when the export fails even without the avatar", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(() => {
      throw new DOMException("tainted", "SecurityError");
    });
    renderDialog();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Tải PNG" }));
    });

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Không tải được ảnh QR"));
    expect(downloads).toEqual([]);
  });
});

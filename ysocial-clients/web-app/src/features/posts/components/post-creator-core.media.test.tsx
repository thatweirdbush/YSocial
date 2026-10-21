import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api-error";
import type { UploadedMedia } from "@/lib/media/media-api";
import { setRealSlices } from "@/test/api-test-utils";

import { useDraftStore } from "../store/post-draft-store";
import { PostCreatorCore } from "./post-creator-core";

const api = vi.hoisted(() => ({ uploadMedia: vi.fn(), discardMedia: vi.fn() }));
vi.mock("@/lib/media/media-api", () => api);
vi.mock("@/lib/media/compress-image", () => ({ compressImage: async (file: File) => file }));

const uploaded = (id: string): UploadedMedia => ({ id, kind: "image", url: `https://res.cloudinary.com/demo/image/upload/v1/${id}.jpg`, width: 10, height: 10, bytes: 5 });
const png = (name = "a.png") => new File(["x"], name, { type: "image/png" });
const fileInput = (container: HTMLElement) => container.querySelector("input[type=file]") as HTMLInputElement | null;

beforeEach(() => {
  useDraftStore.setState({ drafts: [] });
  let counter = 0;
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => `blob:p-${++counter}`), revokeObjectURL: vi.fn() }));
  api.uploadMedia.mockImplementation(async (file: File) => uploaded(`id-${file.name}`));
  api.discardMedia.mockResolvedValue(undefined);
});

afterEach(() => {
  setRealSlices("none");
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("PostCreatorCore media - real BE (uploads)", () => {
  beforeEach(() => setRealSlices("auth,content"));

  it("offers the attach button with the BE accepted types, post mode only", () => {
    const post = render(<PostCreatorCore />);
    expect(fileInput(post.container)?.getAttribute("accept")).toBe("image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/webm");
    post.unmount();

    const reply = render(<PostCreatorCore mode="reply" />);
    expect(fileInput(reply.container)).toBeNull();
  });

  it("hides the GIF picker in reply mode (BE comments carry no media) but not in post mode", () => {
    const post = render(<PostCreatorCore />);
    expect(screen.getByRole("button", { name: "GIF" })).toBeInTheDocument();
    post.unmount();

    render(<PostCreatorCore mode="reply" />);
    expect(screen.queryByRole("button", { name: "GIF" })).toBeNull();
  });

  it("uploads a picked file and submits the media ids as the 5th argument, then clears", async () => {
    const onPostSubmitted = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<PostCreatorCore onPostSubmitted={onPostSubmitted} />);

    await act(async () => {
      fireEvent.change(fileInput(container)!, { target: { files: [png("a.png"), png("b.png")] } });
    });
    await waitFor(() => expect(api.uploadMedia).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText("Đang tải lên...")).toBeNull());

    await userEvent.type(screen.getByRole("textbox"), "with photos");
    await userEvent.click(screen.getByRole("button", { name: "Đăng" }));

    await waitFor(() => expect(onPostSubmitted).toHaveBeenCalledWith("with photos", [], "anyone", "public", ["id-a.png", "id-b.png"]));
    expect(api.discardMedia).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("img", { name: "a.png" })).toBeNull());
  });

  it("allows a media-only post (no text)", async () => {
    const onPostSubmitted = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<PostCreatorCore onPostSubmitted={onPostSubmitted} />);

    await act(async () => {
      fireEvent.change(fileInput(container)!, { target: { files: [png()] } });
    });
    await waitFor(() => expect(screen.queryByText("Đang tải lên...")).toBeNull());
    await userEvent.click(screen.getByRole("button", { name: "Đăng" }));

    await waitFor(() => expect(onPostSubmitted).toHaveBeenCalledWith("", [], "anyone", "public", ["id-a.png"]));
  });

  it("does not submit while an upload is still running", async () => {
    let release: (media: UploadedMedia) => void = () => {};
    api.uploadMedia.mockImplementation(() => new Promise<UploadedMedia>((resolve) => (release = resolve)));
    const onPostSubmitted = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<PostCreatorCore onPostSubmitted={onPostSubmitted} />);

    await act(async () => {
      fireEvent.change(fileInput(container)!, { target: { files: [png()] } });
    });
    await userEvent.type(screen.getByRole("textbox"), "wait for me");
    await userEvent.click(screen.getByRole("button", { name: "Đăng" }));

    expect(onPostSubmitted).not.toHaveBeenCalled();

    await act(async () => release(uploaded("late")));
    await userEvent.click(screen.getByRole("button", { name: "Đăng" }));
    await waitFor(() => expect(onPostSubmitted).toHaveBeenCalledWith("wait for me", [], "anyone", "public", ["late"]));
  });

  it("does not submit while a failed upload is still there (retry or remove first)", async () => {
    api.uploadMedia.mockRejectedValue(new ApiError({ kind: "http", status: 500, code: "InternalError" }));
    const onPostSubmitted = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<PostCreatorCore onPostSubmitted={onPostSubmitted} />);

    await act(async () => {
      fireEvent.change(fileInput(container)!, { target: { files: [png()] } });
    });
    await screen.findByRole("alert");
    await userEvent.type(screen.getByRole("textbox"), "text");
    await userEvent.click(screen.getByRole("button", { name: "Đăng" }));

    expect(onPostSubmitted).not.toHaveBeenCalled();
  });

  it("removing a ready attachment discards it on the BE", async () => {
    const { container } = render(<PostCreatorCore />);
    await act(async () => {
      fireEvent.change(fileInput(container)!, { target: { files: [png()] } });
    });
    await waitFor(() => expect(screen.queryByText("Đang tải lên...")).toBeNull());

    await userEvent.click(screen.getByRole("button", { name: "Xóa" }));

    expect(api.discardMedia).toHaveBeenCalledWith("id-a.png");
  });

  it("503 explains that uploads are unavailable, and text posting still works", async () => {
    api.uploadMedia.mockRejectedValue(new ApiError({ kind: "http", status: 503, code: "MediaStorageUnavailable" }));
    const onPostSubmitted = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<PostCreatorCore onPostSubmitted={onPostSubmitted} />);

    await act(async () => {
      fireEvent.change(fileInput(container)!, { target: { files: [png()] } });
    });
    expect((await screen.findByRole("alert")).textContent).toContain("Hiện chưa thể tải tệp lên");

    await userEvent.click(screen.getByRole("button", { name: "Xóa" }));
    await userEvent.type(screen.getByRole("textbox"), "just text");
    await userEvent.click(screen.getByRole("button", { name: "Đăng" }));

    await waitFor(() => expect(onPostSubmitted).toHaveBeenCalledWith("just text", [], "anyone", "public"));
  });

  it("an external GIF still travels in images, without media ids", async () => {
    const onPostSubmitted = vi.fn().mockResolvedValue(undefined);
    render(<PostCreatorCore onPostSubmitted={onPostSubmitted} />);

    await userEvent.click(screen.getByRole("button", { name: "GIF" }));
    const gif = (await screen.findAllByRole("img")).find((image) => image.getAttribute("src")?.startsWith("http"));
    await userEvent.click(gif!.closest("button")!);
    await userEvent.click(screen.getByRole("button", { name: "Đăng" }));

    await waitFor(() => expect(onPostSubmitted).toHaveBeenCalledWith("", [gif!.getAttribute("src")], "anyone", "public"));
  });
});

describe("PostCreatorCore media - mock mode keeps blob previews", () => {
  it("accepts any image, shows blob previews and never calls the upload API", async () => {
    const onPostSubmitted = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<PostCreatorCore onPostSubmitted={onPostSubmitted} />);

    expect(fileInput(container)?.getAttribute("accept")).toBe("image/*");

    await act(async () => {
      fireEvent.change(fileInput(container)!, { target: { files: [png()] } });
    });

    expect(api.uploadMedia).not.toHaveBeenCalled();
    expect(screen.getByRole("img", { name: "Preview 1" }).getAttribute("src")).toBe("blob:p-1");

    await userEvent.click(screen.getByRole("button", { name: "Đăng" }));
    await waitFor(() => expect(onPostSubmitted).toHaveBeenCalledWith("", ["blob:p-1"], "anyone", "public"));
  });
});

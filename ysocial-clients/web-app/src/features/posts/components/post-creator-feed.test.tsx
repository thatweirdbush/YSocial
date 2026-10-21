import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { UploadedMedia } from "@/lib/media/media-api";
import { setRealSlices } from "@/test/api-test-utils";

import { PostCreatorFeed } from "./post-creator-feed";

const api = vi.hoisted(() => ({ uploadMedia: vi.fn(), discardMedia: vi.fn() }));
vi.mock("@/lib/media/media-api", () => api);
vi.mock("@/lib/media/compress-image", () => ({ compressImage: async (file: File) => file }));

beforeEach(() => {
  let counter = 0;
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => `blob:p-${++counter}`), revokeObjectURL: vi.fn() }));
  api.uploadMedia.mockImplementation(async (file: File): Promise<UploadedMedia> => ({ id: `id-${file.name}`, kind: "image", url: "https://res.cloudinary.com/demo/image/upload/v1/a.jpg" }));
});

afterEach(() => {
  setRealSlices("none");
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("PostCreatorFeed", () => {
  it("hands the uploaded media ids to onSuccess as part of the create input", async () => {
    setRealSlices("auth,content");
    const onSuccess = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<PostCreatorFeed onSuccess={onSuccess} />);

    await act(async () => {
      fireEvent.change(container.querySelector("input[type=file]")!, { target: { files: [new File(["x"], "a.png", { type: "image/png" })] } });
    });
    await waitFor(() => expect(screen.queryByText("Đang tải lên...")).toBeNull());
    await userEvent.type(screen.getByRole("textbox"), "hello");
    await userEvent.click(screen.getByRole("button", { name: "Đăng" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith({ content: "hello", images: [], audience: "anyone", mediaIds: ["id-a.png"] }));
  });

  it("sends no mediaIds key for a text post", async () => {
    const onSuccess = vi.fn().mockResolvedValue(undefined);
    render(<PostCreatorFeed onSuccess={onSuccess} />);

    await userEvent.type(screen.getByRole("textbox"), "plain");
    await userEvent.click(screen.getByRole("button", { name: "Đăng" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith({ content: "plain", images: [], audience: "anyone" }));
  });
});

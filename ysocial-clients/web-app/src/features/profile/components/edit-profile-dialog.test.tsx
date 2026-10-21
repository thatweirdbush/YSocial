import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api-error";
import type { UploadedMedia } from "@/lib/media/media-api";
import { setRealSlices } from "@/test/api-test-utils";

import type { UserProfile } from "../types";
import { EditProfileDialog } from "./edit-profile-dialog";

const api = vi.hoisted(() => ({ uploadMedia: vi.fn(), discardMedia: vi.fn() }));
const service = vi.hoisted(() => ({ updateProfile: vi.fn() }));
vi.mock("@/lib/media/media-api", () => api);
vi.mock("@/lib/media/compress-image", () => ({ compressImage: async (file: File) => file }));
vi.mock("../services/user-service", () => service);

const STORED = "https://res.cloudinary.com/demo/image/upload/v1/ysocial/dev/avatars/old.jpg";

const user = (overrides: Partial<UserProfile> = {}): UserProfile =>
  ({
    id: "0b8f1c52-6a3e-4c53-9b42-5f9d6f7a1e10",
    username: "me",
    displayName: "Me",
    bio: "hello",
    avatarUrl: STORED,
    followersCount: 0,
    followingCount: 0,
    followStatus: "none",
    isPrivate: false,
    ...overrides,
  }) as UserProfile;

const png = (name = "me.png") => new File(["x"], name, { type: "image/png" });
const input = () => document.querySelector("input[type=file]") as HTMLInputElement;

beforeEach(() => {
  let counter = 0;
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => `blob:avatar-${++counter}`), revokeObjectURL: vi.fn() }));
  api.uploadMedia.mockImplementation(async (file: File): Promise<UploadedMedia> => ({ id: `id-${file.name}`, kind: "image", url: "https://res.cloudinary.com/demo/image/upload/v1/n.jpg" }));
  api.discardMedia.mockResolvedValue(undefined);
  service.updateProfile.mockImplementation(async (_id: string, patch: { displayName: string }) => ({ ...user(), displayName: patch.displayName }));
});

afterEach(() => {
  setRealSlices("none");
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

const open = (profile = user()) => render(<EditProfileDialog open onOpenChange={() => {}} user={profile} />);
const save = () => userEvent.click(screen.getByRole("button", { name: "Lưu" }));

describe("EditProfileDialog avatar - real BE", () => {
  beforeEach(() => setRealSlices("auth,content"));

  it("replaces the url field with a photo picker that only takes images", () => {
    open();

    expect(screen.queryByLabelText(/avatar/i)).toBeNull();
    expect(input().getAttribute("accept")).toBe("image/jpeg,image/png,image/gif,image/webp");
    expect(screen.getByRole("button", { name: "Đổi ảnh" })).toBeInTheDocument();
  });

  it("an unrelated edit re-sends the current avatar url (keep)", async () => {
    open();

    await save();

    await waitFor(() => expect(service.updateProfile).toHaveBeenCalled());
    expect(service.updateProfile.mock.calls[0][1]).toEqual({ displayName: "Me", bio: "hello", avatarUrl: STORED });
  });

  it("a new photo is uploaded on select (purpose avatar) and saved as avatarMediaId, without avatarUrl", async () => {
    open();

    await act(async () => {
      fireEvent.change(input(), { target: { files: [png()] } });
    });
    await waitFor(() => expect(api.uploadMedia).toHaveBeenCalledWith(expect.any(File), "avatar", expect.anything()));
    await waitFor(() => expect(screen.queryByText("Đang tải ảnh lên...")).toBeNull());
    await save();

    await waitFor(() => expect(service.updateProfile).toHaveBeenCalled());
    const patch = service.updateProfile.mock.calls[0][1];
    expect(patch.avatarMediaId).toBe("id-me.png");
    expect(patch).not.toHaveProperty("avatarUrl");
  });

  it("choosing another photo discards the previous pending upload", async () => {
    open();
    await act(async () => {
      fireEvent.change(input(), { target: { files: [png("one.png")] } });
    });
    await waitFor(() => expect(api.uploadMedia).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText("Đang tải ảnh lên...")).toBeNull());

    await act(async () => {
      fireEvent.change(input(), { target: { files: [png("two.png")] } });
    });

    expect(api.discardMedia).toHaveBeenCalledWith("id-one.png");
    await waitFor(() => expect(api.uploadMedia).toHaveBeenCalledTimes(2));
  });

  it("remove sends neither url nor media id (the BE clears the avatar)", async () => {
    open();

    await userEvent.click(screen.getByRole("button", { name: "Xóa ảnh" }));
    await save();

    await waitFor(() => expect(service.updateProfile).toHaveBeenCalled());
    const patch = service.updateProfile.mock.calls[0][1];
    expect(patch.avatarUrl).toBeUndefined();
    expect(patch.avatarMediaId).toBeUndefined();
  });

  it("does not save while the photo is still uploading", async () => {
    api.uploadMedia.mockImplementation(() => new Promise(() => {}));
    open();
    await act(async () => {
      fireEvent.change(input(), { target: { files: [png()] } });
    });

    await save();

    expect(service.updateProfile).not.toHaveBeenCalled();
  });

  it("closing without saving discards the pending upload", async () => {
    const onOpenChange = vi.fn();
    render(<EditProfileDialog open onOpenChange={onOpenChange} user={user()} />);
    await act(async () => {
      fireEvent.change(input(), { target: { files: [png()] } });
    });
    await waitFor(() => expect(screen.queryByText("Đang tải ảnh lên...")).toBeNull());

    await userEvent.click(screen.getByRole("button", { name: "Hủy" }));

    expect(api.discardMedia).toHaveBeenCalledWith("id-me.png");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("saving does NOT discard the photo (it is attached now)", async () => {
    open();
    await act(async () => {
      fireEvent.change(input(), { target: { files: [png()] } });
    });
    await waitFor(() => expect(screen.queryByText("Đang tải ảnh lên...")).toBeNull());

    await save();

    await waitFor(() => expect(service.updateProfile).toHaveBeenCalled());
    expect(api.discardMedia).not.toHaveBeenCalled();
  });

  it("shows why an upload failed", async () => {
    api.uploadMedia.mockRejectedValue(new ApiError({ kind: "http", status: 503, code: "MediaStorageUnavailable" }));
    open();

    await act(async () => {
      fireEvent.change(input(), { target: { files: [png()] } });
    });

    expect((await screen.findByRole("alert")).textContent).toContain("Hiện chưa thể tải tệp lên");
  });
});

describe("EditProfileDialog avatar - mock mode", () => {
  it("keeps the avatar url field and never uploads", async () => {
    open(user({ avatarUrl: undefined }));

    expect(screen.getByLabelText(/Avatar|Ảnh đại diện/i)).toBeInTheDocument();
    expect(document.querySelector("input[type=file]")).toBeNull();
  });
});

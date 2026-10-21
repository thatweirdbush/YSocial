import type { MeDto } from "@/features/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GENDER_TO_INT, parseGender, saveAccountProfile } from "./account-service";

const put = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-client", () => ({ apiClient: { put } }));

const me: MeDto = {
  email: "real@ysocial.dev",
  gender: "male",
  dateOfBirth: "1999-05-20",
  profile: {
    id: "0b8f1c52-6a3e-4c53-9b42-5f9d6f7a1e10",
    username: "real_user",
    displayName: "Real User",
    bio: "hello",
    avatarUrl: "https://img/a.png",
    coverUrl: null,
  } as MeDto["profile"],
};

beforeEach(() => {
  put.mockReset();
  put.mockResolvedValue({ id: "x" });
});

describe("saveAccountProfile", () => {
  it("sends the FULL current profile fields (the BE replaces them) plus gender int & wire birth date", async () => {
    await saveAccountProfile(me, { gender: "female", dateOfBirth: "2000-02-29" });

    expect(put).toHaveBeenCalledWith("/api/users/profiles/me", {
      displayName: "Real User",
      bio: "hello",
      avatarUrl: "https://img/a.png",
      coverUrl: null,
      gender: GENDER_TO_INT.female,
      dateOfBirth: "2000-02-29T00:00:00Z",
    });
  });

  it("omits the birth date when there is none (null would read as 'keep stored' anyway)", async () => {
    await saveAccountProfile({ ...me, dateOfBirth: null }, { gender: "unspecified", dateOfBirth: null });

    const body = put.mock.calls[0][1] as Record<string, unknown>;
    expect(body).not.toHaveProperty("dateOfBirth");
    expect(body.gender).toBe(0);
  });

  it("re-sends a stored cover & clears nothing it was not asked to", async () => {
    await saveAccountProfile({ ...me, profile: { ...me.profile!, coverUrl: "https://img/c.png", bio: null } }, { gender: "other", dateOfBirth: null });

    expect(put.mock.calls[0][1]).toMatchObject({ coverUrl: "https://img/c.png", bio: null, gender: 3 });
  });

  it("rejects when the profile of the snapshot is missing", async () => {
    await expect(saveAccountProfile({ ...me, profile: undefined }, { gender: "male", dateOfBirth: null })).rejects.toThrow();
    expect(put).not.toHaveBeenCalled();
  });
});

describe("parseGender", () => {
  it("accepts the 4 read values & falls back to unspecified", () => {
    expect(["unspecified", "male", "female", "other"].map(parseGender)).toEqual(["unspecified", "male", "female", "other"]);
    expect(parseGender("MALE")).toBe("unspecified");
    expect(parseGender(null)).toBe("unspecified");
    expect(parseGender(undefined)).toBe("unspecified");
  });
});

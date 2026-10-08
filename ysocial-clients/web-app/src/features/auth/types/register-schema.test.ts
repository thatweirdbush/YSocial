import { describe, expect, it } from "vitest";

import { translate } from "@/lib/i18n/translate";
import { SEED_FANS } from "@/mocks/seed-fans";
import { getRegisterSchema } from "./index";

const schema = getRegisterSchema((key) => translate("vi", key));
const valid = { email: "a@b.co", username: "new.user", password: "secret1", confirmPassword: "secret1" };
const usernameError = (username: string) => {
  const result = schema.safeParse({ ...valid, username });
  return result.success ? null : result.error.issues.find((issue) => issue.path[0] === "username")?.message ?? null;
};

describe("register schema username", () => {
  it("accepts a username the session cookie can represent", () => {
    expect(usernameError("new.user_01")).toBeNull();
  });

  it.each(["huy-phan", "huy phan", "Huy.Phan", "tên.việt", "a".repeat(31)])("rejects %s (not representable in the mock session)", (name) => {
    expect(usernameError(name)).not.toBeNull();
  });

  it.each(["anquoc.dev", "AnQuoc.Dev", "ysocial_member", SEED_FANS[0].username])("rejects the reserved seed username %s", (name) => {
    expect(usernameError(name)).not.toBeNull();
  });
});

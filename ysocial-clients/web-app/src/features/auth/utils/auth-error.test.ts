import { describe, expect, it } from "vitest";
import { ApiError, networkError } from "@/lib/api-error";
import { authErrorKey, authFieldErrors } from "./auth-error";

const http = (status: number, code: string, errors?: Record<string, string[]>) =>
  new ApiError({ kind: "http", status, code, errors });

describe("authErrorKey", () => {
  it.each([
    ["InvalidCredentials", "auth.errorInvalidCredentials"],
    ["AccountInactive", "auth.errorAccountInactive"],
    ["EmailTaken", "auth.errorEmailTaken"],
    ["UsernameTaken", "auth.errorUsernameTaken"],
    ["InvalidOtp", "auth.errorInvalidOtp"],
    ["OtpAttemptsExceeded", "auth.errorOtpAttemptsExceeded"],
    ["ValidationFailed", "auth.errorValidationFailed"],
    ["BusinessRuleViolated", "auth.errorValidationFailed"],
    ["Unauthenticated", "auth.errorSessionExpired"],
    ["InvalidRefreshToken", "auth.errorSessionExpired"],
    ["InternalError", "auth.errorUnexpected"],
    ["Unknown", "auth.errorUnexpected"],
  ])("%s -> %s", (code, key) => {
    expect(authErrorKey(http(400, code))).toBe(key);
  });

  it("network error -> errorNetwork", () => {
    expect(authErrorKey(networkError(new TypeError("Failed to fetch")))).toBe("auth.errorNetwork");
  });

  it("non ApiError -> errorUnexpected", () => {
    expect(authErrorKey(new Error("boom"))).toBe("auth.errorUnexpected");
    expect(authErrorKey(undefined)).toBe("auth.errorUnexpected");
  });
});

describe("authFieldErrors", () => {
  it("returns first message per field, keys camelCased", () => {
    const error = http(400, "ValidationFailed", { Email: ["bad email", "other"], Password: ["too short"] });
    expect(authFieldErrors(error)).toEqual({ email: "bad email", password: "too short" });
  });

  it("empty for errors without a field map or non ApiError", () => {
    expect(authFieldErrors(http(409, "EmailTaken"))).toEqual({});
    expect(authFieldErrors(new Error("x"))).toEqual({});
  });
});

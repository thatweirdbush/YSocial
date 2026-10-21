import type { components } from "@/lib/api/generated";
import { z } from "zod";
import { isRealApi } from "@/lib/api-config";
import type { TranslationKey } from "@/lib/i18n/translate";
import { SEED_AUTHORS, SEED_DEMO_ACCOUNT } from "@/mocks/seed-authors";
import { SEED_FANS } from "@/mocks/seed-fans";
import { USERNAME_PATTERN } from "../utils/mock-session";

// #region Backend DTOs
type Schemas = components["schemas"];

export type LoginRequest = Schemas["LoginRequest"];
export type LogoutRequest = Schemas["LogoutRequest"];
export type RegisterAccountRequest = Schemas["RegisterAccountRequest"];
export type ForgotPasswordRequest = Schemas["ForgotPasswordRequest"];
export type ResetPasswordRequest = Schemas["ResetPasswordRequest"];
export type LoginResponse = Schemas["LoginResponse"];
export type MeDto = Schemas["MeDto"];
/** Profile switcher entry (`MeDto.profiles`). */
export type ProfileSummary = Schemas["ProfileSummaryDto"];
// #endregion

// #region Domain models
/** Signed-in account snapshot persisted by the auth store. */
export interface AuthUser {
  id: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
  bio?: string;
  username?: string;
}

/** Register form payload handed to `authService.register`. */
export interface RegisterInput {
  email: string;
  password: string;
  username: string;
  phoneNumber?: string;
}

/** Reset-password payload (OTP flow) handed to `authService.resetPassword`. */
export interface ResetPasswordInput {
  loginId: string;
  otp: string;
  newPassword: string;
}

/** Identity mirrored into the mock session cookie (no mutable profile data). */
export interface MockSessionIdentity {
  id: string;
  username: string;
}
// #endregion

// #region Form schemas & values
/** Seed usernames a new mock account must not take (the server resolves them to the seed user first). */
const RESERVED_USERNAMES = new Set([...SEED_AUTHORS, SEED_DEMO_ACCOUNT, ...SEED_FANS].map((author) => author.username));

export const getIdentitySchema = (t: (key: TranslationKey) => string) =>
  z.object({
    identity: z
      .string()
      .min(1, { message: t("auth.errorIdentityRequired") })
      .min(3, { message: t("auth.errorIdentityLength") }),
  });

export const getPasswordSchema = (t: (key: TranslationKey) => string) =>
  z.object({
    password: z
      .string()
      .min(1, { message: t("auth.errorPasswordRequired") })
      .min(6, { message: t("auth.errorPasswordLength") }),
  });

export const getForgotSchema = (t: (key: TranslationKey) => string) =>
  z.object({
    email: z
      .string()
      .min(1, { message: t("auth.errorEmailRequired") })
      .email({ message: t("auth.errorEmailInvalid") }),
  });

export const getResetSchema = (t: (key: TranslationKey) => string) =>
  z
    .object({
      otp: z
        .string()
        .min(1, { message: t("auth.errorOtpRequired") })
        .length(6, { message: t("auth.errorOtpLength") }),
      newPassword: z
        .string()
        .min(1, { message: t("auth.errorPasswordRequired") })
        .min(6, { message: t("auth.errorPasswordLength") }),
      confirmNewPassword: z.string().min(1, { message: t("auth.errorPasswordRequired") }),
    })
    .refine((data) => data.newPassword === data.confirmNewPassword, {
      message: t("auth.errorConfirmPassword"),
      path: ["confirmNewPassword"],
    });

export const getRegisterSchema = (t: (key: TranslationKey) => string) =>
  z
    .object({
      email: z
        .string()
        .min(1, { message: t("auth.errorEmailRequired") })
        .email({ message: t("auth.errorEmailInvalid") }),
      username: z
        .string()
        .min(1, { message: t("auth.errorUsernameRequired") })
        .min(3, { message: t("auth.errorUsernameLength") })
        // Must survive the mock session cookie (`parseMockSession`), else the own profile 404s
        .regex(USERNAME_PATTERN, { message: t("auth.errorUsernamePattern") })
        // Mock-only rule: the real BE answers 409 `UsernameTaken` itself
        .refine((value) => isRealApi("auth") || !RESERVED_USERNAMES.has(value), { message: t("auth.errorUsernameTaken") }),
      password: z
        .string()
        .min(1, { message: t("auth.errorPasswordRequired") })
        .min(6, { message: t("auth.errorPasswordLength") }),
      confirmPassword: z.string().min(1, { message: t("auth.errorPasswordRequired") }),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: t("auth.errorConfirmPassword"),
      path: ["confirmPassword"],
    });

export type IdentityFormValues = {
  identity: string;
};

export type PasswordFormValues = {
  password: string;
};

export type ForgotFormValues = {
  email: string;
};

export type ResetFormValues = {
  otp: string;
  newPassword: string;
  confirmNewPassword: string;
};

export type RegisterFormValues = {
  email: string;
  username: string;
  password: string;
  confirmPassword: string;
};
// #endregion

import { z } from "zod";

export const getIdentitySchema = (t: (key: any) => string) =>
  z.object({
    identity: z
      .string()
      .min(1, { message: t("auth.errorIdentityRequired") })
      .min(3, { message: t("auth.errorIdentityLength") }),
  });

export const getPasswordSchema = (t: (key: any) => string) =>
  z.object({
    password: z
      .string()
      .min(1, { message: t("auth.errorPasswordRequired") })
      .min(6, { message: t("auth.errorPasswordLength") }),
  });

export const getForgotSchema = (t: (key: any) => string) =>
  z.object({
    email: z
      .string()
      .min(1, { message: t("auth.errorEmailRequired") })
      .email({ message: t("auth.errorEmailInvalid") }),
  });

export const getResetSchema = (t: (key: any) => string) =>
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

export const getRegisterSchema = (t: (key: any) => string) =>
  z
    .object({
      email: z
        .string()
        .min(1, { message: t("auth.errorEmailRequired") })
        .email({ message: t("auth.errorEmailInvalid") }),
      username: z
        .string()
        .min(1, { message: t("auth.errorUsernameRequired") })
        .min(3, { message: t("auth.errorUsernameLength") }),
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

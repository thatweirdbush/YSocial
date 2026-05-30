"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useTranslation } from "@/hooks/use-translation";
import { useAuthActions } from "@/features/auth/store/auth-store";
import { Button } from "@/components/ui/button";
import {
  getIdentitySchema,
  getPasswordSchema,
  getForgotSchema,
  getResetSchema,
  IdentityFormValues,
  PasswordFormValues,
  ForgotFormValues,
  ResetFormValues,
} from "../types";

export const LoginForm: React.FC = () => {
  const [step, setStep] = useState<"identity" | "password" | "forgot" | "reset">("identity");
  const [identity, setIdentity] = useState("");
  const [resetEmail, setResetEmail] = useState("");

  switch (step) {
    case "identity":
      return (
        <IdentityStep
          identity={identity}
          onContinue={(val) => {
            setIdentity(val);
            setStep("password");
          }}
        />
      );
    case "password":
      return (
        <PasswordStep
          identity={identity}
          onBack={() => setStep("identity")}
          onForgotPassword={() => {
            // Check if identity looks like an email to prefill the forgot email step
            if (identity.includes("@")) {
              setResetEmail(identity);
            }
            setStep("forgot");
          }}
        />
      );
    case "forgot":
      return (
        <ForgotStep
          defaultEmail={resetEmail}
          onBack={() => setStep("identity")}
          onSent={(email) => {
            setResetEmail(email);
            setStep("reset");
          }}
        />
      );
    case "reset":
      return (
        <ResetStep
          email={resetEmail}
          onBack={() => setStep("forgot")}
          onSuccess={() => {
            setStep("identity");
          }}
        />
      );
    default:
      return null;
  }
};

/* ==========================================================================
   Identity Step (Stage 1)
   ========================================================================== */
interface IdentityStepProps {
  identity: string;
  onContinue: (val: string) => void;
}

const IdentityStep: React.FC<IdentityStepProps> = ({ identity, onContinue }) => {
  const { t } = useTranslation();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<IdentityFormValues>({
    resolver: zodResolver(getIdentitySchema(t)),
    defaultValues: { identity },
  });

  const onSubmit = async (data: IdentityFormValues) => {
    // Simulate lightweight API lookup
    await new Promise((resolve) => setTimeout(resolve, 800));
    onContinue(data.identity);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5 w-full">
      <div className="text-center md:text-left">
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          {t("auth.loginTitle") || "Log in to YSocial"}
        </h2>
      </div>

      <div className="border-b border-zinc-200 dark:border-zinc-800 py-3 flex flex-col gap-2 transition-colors focus-within:border-zinc-950 dark:focus-within:border-zinc-200">
        <label className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
          {t("auth.identityLabel") || "Email, username or phone number"}
        </label>
        <input
          {...register("identity")}
          placeholder={t("auth.identityPlaceholderShort") || "Enter your account..."}
          className="bg-transparent border-none outline-none focus:outline-none w-full text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-700"
          disabled={isSubmitting}
          autoFocus
        />
      </div>
      {errors.identity && (
        <span className="text-xs text-red-500 -mt-2 animate-fade-in font-medium">
          {errors.identity.message}
        </span>
      )}

      <Button
        type="submit"
        disabled={isSubmitting}
        className="rounded-full w-full py-3.5 bg-black text-white hover:bg-zinc-900 dark:bg-white dark:text-black dark:hover:bg-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-sm transition-all duration-300 h-auto"
      >
        {isSubmitting ? (
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="animate-spin size-4" />
            <span>{t("creator.posting") || "Posting..."}</span>
          </div>
        ) : (
          t("auth.continue") || "Continue"
        )}
      </Button>

      {/* Social OAuth Separator */}
      <div className="flex items-center my-1 w-full select-none">
        <div className="flex-1 border-t border-zinc-100 dark:border-zinc-900"></div>
        <span className="px-3 text-[11px] text-zinc-400 dark:text-zinc-500 font-semibold uppercase tracking-wider whitespace-nowrap">
          {t("auth.orContinueWith") || "Or continue with"}
        </span>
        <div className="flex-1 border-t border-zinc-100 dark:border-zinc-900"></div>
      </div>

      {/* Social OAuth Buttons */}
      <div className="grid grid-cols-3 gap-2.5 w-full">
        <button
          type="button"
          onClick={() => toast.success("Redirecting to Google secure authentication...")}
          className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-full border border-zinc-150 dark:border-zinc-900 bg-transparent hover:bg-zinc-50 dark:hover:bg-zinc-950/50 text-[11px] font-bold text-zinc-800 dark:text-zinc-200 transition-all duration-300 active:scale-95 cursor-pointer"
        >
          <svg className="size-3.5 fill-current shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Google
        </button>

        <button
          type="button"
          onClick={() => toast.success("Redirecting to Apple secure authentication...")}
          className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-full border border-zinc-150 dark:border-zinc-900 bg-transparent hover:bg-zinc-50 dark:hover:bg-zinc-950/50 text-[11px] font-bold text-zinc-800 dark:text-zinc-200 transition-all duration-300 active:scale-95 cursor-pointer"
        >
          <svg className="size-3.5 fill-current shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.17c.66-.81 1.11-1.93.99-3.06-1 .04-2.2 1.67-2.92 2.51-.64.73-1.2 1.87-1.05 2.97 1.12.09 2.27-.75 2.98-1.55z" />
          </svg>
          Apple
        </button>

        <button
          type="button"
          onClick={() => toast.success("Redirecting to Microsoft secure authentication...")}
          className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-full border border-zinc-150 dark:border-zinc-900 bg-transparent hover:bg-zinc-50 dark:hover:bg-zinc-950/50 text-[11px] font-bold text-zinc-800 dark:text-zinc-200 transition-all duration-300 active:scale-95 cursor-pointer"
        >
          <svg className="size-3.5 fill-current shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M1 1h10v10H1zM13 1h10v10H13zM1 13h10v10H1zM13 13h10v10H13z" />
          </svg>
          Microsoft
        </button>
      </div>

      <div className="text-center mt-2">
        <span className="text-xs text-zinc-500">
          {t("auth.noAccountPrompt") || "Don't have an account?"}{" "}
          <a
            href="/register"
            className="text-zinc-900 dark:text-zinc-100 hover:underline font-bold transition-all ml-1"
          >
            {t("auth.switchToRegister") || "Register here"}
          </a>
        </span>
      </div>
    </form>
  );
};

/* ==========================================================================
   Password Step (Stage 2)
   ========================================================================== */
interface PasswordStepProps {
  identity: string;
  onBack: () => void;
  onForgotPassword: () => void;
}

const PasswordStep: React.FC<PasswordStepProps> = ({ identity, onBack, onForgotPassword }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { setTokens, updateUser } = useAuthActions();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PasswordFormValues>({
    resolver: zodResolver(getPasswordSchema(t)),
  });

  const onSubmit = async (data: PasswordFormValues) => {
    // Simulate high-fidelity login transaction
    await new Promise((resolve) => setTimeout(resolve, 1200));

    // Update tokens and user details inzustand store
    setTokens("mock_access_token", "mock_refresh_token");
    updateUser({
      id: "1",
      email: identity.includes("@") ? identity : "member@ysocial.dev",
      displayName: "YSocial Member",
      username: identity.includes("@") ? identity.split("@")[0] : identity,
      bio: "Joined YSocial Premium Social Ecosystem",
    });

    toast.success(t("auth.toastLoginSuccess") || "Welcome back to YSocial!");
    router.push("/");
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5 w-full">
      <div className="text-center md:text-left">
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          {t("auth.loginTitle") || "Log in to YSocial"}
        </h2>
      </div>

      {/* Static Identity Lock-in Header */}
      <div className="w-full bg-zinc-50 dark:bg-zinc-950 py-2.5 px-4 rounded-2xl border border-zinc-100 dark:border-zinc-900 flex justify-between items-center transition-colors">
        <span className="text-xs text-zinc-500 font-semibold truncate max-w-[200px]">
          {identity}
        </span>
        <button
          type="button"
          onClick={onBack}
          className="text-xs font-bold text-zinc-400 dark:text-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-200 transition-colors select-none"
        >
          {t("auth.editIdentity") || "Edit"}
        </button>
      </div>

      <div className="border-b border-zinc-200 dark:border-zinc-800 py-3 flex flex-col gap-2 transition-colors focus-within:border-zinc-950 dark:focus-within:border-zinc-200">
        <label className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
          {t("auth.passwordLabel") || "Password"}
        </label>
        <input
          {...register("password")}
          type="password"
          placeholder={t("auth.passwordPlaceholder") || "Enter your password"}
          className="bg-transparent border-none outline-none focus:outline-none w-full text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-700"
          disabled={isSubmitting}
          autoFocus
        />
      </div>
      {errors.password && (
        <span className="text-xs text-red-500 -mt-2 animate-fade-in font-medium">
          {errors.password.message}
        </span>
      )}

      <div className="text-right -mt-1">
        <button
          type="button"
          onClick={onForgotPassword}
          className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:underline"
        >
          {t("auth.forgotPasswordPrompt") || "Forgot password?"}
        </button>
      </div>

      <Button
        type="submit"
        disabled={isSubmitting}
        className="rounded-full w-full py-3.5 bg-black text-white hover:bg-zinc-900 dark:bg-white dark:text-black dark:hover:bg-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-sm transition-all duration-300 h-auto"
      >
        {isSubmitting ? (
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="animate-spin size-4" />
            <span>{t("auth.loggingIn") || "Logging in..."}</span>
          </div>
        ) : (
          t("auth.loginSubmit") || "Log In"
        )}
      </Button>

      <div className="text-center mt-2">
        <button
          type="button"
          onClick={onBack}
          className="text-xs font-bold text-zinc-500 hover:underline hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          {t("auth.backToLogin") || "Back to log in"}
        </button>
      </div>
    </form>
  );
};

/* ==========================================================================
   Forgot Step (Stage 3)
   ========================================================================== */
interface ForgotStepProps {
  defaultEmail: string;
  onBack: () => void;
  onSent: (email: string) => void;
}

const ForgotStep: React.FC<ForgotStepProps> = ({ defaultEmail, onBack, onSent }) => {
  const { t } = useTranslation();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotFormValues>({
    resolver: zodResolver(getForgotSchema(t)),
    defaultValues: { email: defaultEmail },
  });

  const onSubmit = async (data: ForgotFormValues) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    toast.success(t("auth.toastOtpSent") || "OTP code has been sent successfully!");
    onSent(data.email);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5 w-full">
      <div className="text-center md:text-left">
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          {t("auth.forgotPasswordPrompt") || "Forgot password?"}
        </h2>
      </div>

      <div className="border-b border-zinc-200 dark:border-zinc-800 py-3 flex flex-col gap-2 transition-colors focus-within:border-zinc-950 dark:focus-within:border-zinc-200">
        <label className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
          {t("auth.emailLabel") || "Email"}
        </label>
        <input
          {...register("email")}
          type="email"
          placeholder={t("auth.emailPlaceholder") || "Enter your email address"}
          className="bg-transparent border-none outline-none focus:outline-none w-full text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-700"
          disabled={isSubmitting}
          autoFocus
        />
      </div>
      {errors.email && (
        <span className="text-xs text-red-500 -mt-2 animate-fade-in font-medium">
          {errors.email.message}
        </span>
      )}

      <Button
        type="submit"
        disabled={isSubmitting}
        className="rounded-full w-full py-3.5 bg-black text-white hover:bg-zinc-900 dark:bg-white dark:text-black dark:hover:bg-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-sm transition-all duration-300 h-auto"
      >
        {isSubmitting ? (
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="animate-spin size-4" />
            <span>{t("auth.sendingOtp") || "Sending OTP..."}</span>
          </div>
        ) : (
          t("auth.sendOtp") || "Send OTP"
        )}
      </Button>

      <div className="text-center mt-2">
        <button
          type="button"
          onClick={onBack}
          className="text-xs font-bold text-zinc-500 hover:underline hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          {t("auth.backToLogin") || "Back to log in"}
        </button>
      </div>
    </form>
  );
};

/* ==========================================================================
   Reset Step (Stage 4)
   ========================================================================== */
interface ResetStepProps {
  email: string;
  onBack: () => void;
  onSuccess: () => void;
}

const ResetStep: React.FC<ResetStepProps> = ({ email, onBack, onSuccess }) => {
  const { t } = useTranslation();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetFormValues>({
    resolver: zodResolver(getResetSchema(t)),
  });

  const onSubmit = async (data: ResetFormValues) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    toast.success(t("auth.toastResetSuccess") || "Password reset successfully! Please log in.");
    onSuccess();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5 w-full">
      <div className="text-center md:text-left">
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          {t("auth.resetPassword") || "Reset Password"}
        </h2>
      </div>

      {/* Informative Email Lock-in Banner */}
      <div className="w-full bg-zinc-50 dark:bg-zinc-950 py-2 px-4 rounded-xl border border-zinc-100 dark:border-zinc-900 text-xs text-zinc-500 font-semibold truncate">
        OTP sent to: {email}
      </div>

      {/* OTP Input */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 py-3 flex flex-col gap-2 transition-colors focus-within:border-zinc-950 dark:focus-within:border-zinc-200">
        <label className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
          {t("auth.otpLabel") || "Verification Code (OTP)"}
        </label>
        <input
          {...register("otp")}
          placeholder={t("auth.otpPlaceholder") || "Enter your 6-digit OTP code"}
          className="bg-transparent border-none outline-none focus:outline-none w-full text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-700"
          maxLength={6}
          disabled={isSubmitting}
          autoFocus
        />
      </div>
      {errors.otp && (
        <span className="text-xs text-red-500 -mt-2 animate-fade-in font-medium">
          {errors.otp.message}
        </span>
      )}

      {/* New Password */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 py-3 flex flex-col gap-2 transition-colors focus-within:border-zinc-950 dark:focus-within:border-zinc-200">
        <label className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
          {t("auth.newPasswordLabel") || "New Password"}
        </label>
        <input
          {...register("newPassword")}
          type="password"
          placeholder={t("auth.newPasswordPlaceholder") || "Enter your new password"}
          className="bg-transparent border-none outline-none focus:outline-none w-full text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-700"
          disabled={isSubmitting}
        />
      </div>
      {errors.newPassword && (
        <span className="text-xs text-red-500 -mt-2 animate-fade-in font-medium">
          {errors.newPassword.message}
        </span>
      )}

      {/* Confirm Password */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 py-3 flex flex-col gap-2 transition-colors focus-within:border-zinc-950 dark:focus-within:border-zinc-200">
        <label className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
          {t("auth.confirmNewPasswordLabel") || "Confirm New Password"}
        </label>
        <input
          {...register("confirmNewPassword")}
          type="password"
          placeholder={t("auth.confirmNewPasswordPlaceholder") || "Re-enter your new password"}
          className="bg-transparent border-none outline-none focus:outline-none w-full text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-700"
          disabled={isSubmitting}
        />
      </div>
      {errors.confirmNewPassword && (
        <span className="text-xs text-red-500 -mt-2 animate-fade-in font-medium">
          {errors.confirmNewPassword.message}
        </span>
      )}

      <Button
        type="submit"
        disabled={isSubmitting}
        className="rounded-full w-full py-3.5 bg-black text-white hover:bg-zinc-900 dark:bg-white dark:text-black dark:hover:bg-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-sm transition-all duration-300 h-auto"
      >
        {isSubmitting ? (
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="animate-spin size-4" />
            <span>{t("auth.resettingPassword") || "Resetting password..."}</span>
          </div>
        ) : (
          t("auth.resetPassword") || "Reset Password"
        )}
      </Button>

      <div className="text-center mt-2">
        <button
          type="button"
          onClick={onBack}
          className="text-xs font-bold text-zinc-500 hover:underline hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          {t("auth.backToLogin") || "Back to log in"}
        </button>
      </div>
    </form>
  );
};

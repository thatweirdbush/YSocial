"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useTranslation } from "@/hooks/use-translation";
import { isRealApi } from "@/lib/api-config";
import { Button } from "@/components/ui/button";
import { useSubmitGuard } from "../hooks/use-submit-guard";
import { authService } from "../services/auth-service";
import { authErrorKey } from "../utils/auth-error";
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
    // Mock mode simulates a lightweight lookup; the real BE has no identity-check endpoint
    if (!isRealApi("auth")) await new Promise((resolve) => setTimeout(resolve, 800));
    onContinue(data.identity);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5 w-full">
      <div className="text-center md:text-left">
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          {t("auth.loginTitle")}
        </h2>
      </div>

      <div className="border-b border-zinc-200 dark:border-zinc-800 py-3 flex flex-col gap-2 transition-colors focus-within:border-zinc-950 dark:focus-within:border-zinc-200">
        <label className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
          {t("auth.identityLabel")}
        </label>
        <input
          {...register("identity")}
          placeholder={t("auth.identityPlaceholderShort")}
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
        className="rounded-full w-full py-3.5 bg-black text-white hover:bg-zinc-900 dark:bg-white dark:text-black dark:hover:bg-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-sm transition-all duration-300 h-auto"
      >
        {isSubmitting ? (
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="animate-spin size-4" />
            <span>{t("creator.posting")}</span>
          </div>
        ) : (
          t("auth.continue")
        )}
      </Button>

      {/* Social OAuth Separator */}
      <div className="flex items-center my-1 w-full select-none">
        <div className="flex-1 border-t border-zinc-100 dark:border-zinc-900"></div>
        <span className="px-3 text-[11px] text-zinc-400 dark:text-zinc-500 font-semibold uppercase tracking-wider whitespace-nowrap">
          {t("auth.orContinueWith")}
        </span>
        <div className="flex-1 border-t border-zinc-100 dark:border-zinc-900"></div>
      </div>

      {/* Social OAuth Buttons */}
      <div className="grid grid-cols-3 gap-2.5 w-full">
        <button
          type="button"
          onClick={() => toast.success("Redirecting to Google secure authentication...")}
          className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-full border border-zinc-100 dark:border-zinc-950 bg-transparent hover:bg-zinc-50 dark:hover:bg-zinc-950/50 text-[11px] font-bold text-zinc-800 dark:text-zinc-200 transition-all duration-300 active:scale-95 cursor-pointer"
        >
          <img
            src="/assets/auth/logos/google.svg"
            alt="Google"
            className="h-5 w-5 shrink-0 select-none"
            onError={(e) => {
              // Graceful fallback to text if asset not found yet
              e.currentTarget.style.display = 'none';
            }}
          />
          Google
        </button>

        <button
          type="button"
          onClick={() => toast.success("Redirecting to Apple secure authentication...")}
          className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-full border border-zinc-100 dark:border-zinc-950 bg-transparent hover:bg-zinc-50 dark:hover:bg-zinc-950/50 text-[11px] font-bold text-zinc-800 dark:text-zinc-200 transition-all duration-300 active:scale-95 cursor-pointer"
        >
          <img
            src="/assets/auth/logos/apple.svg"
            alt="Apple"
            className="h-5 w-5 dark:invert shrink-0 select-none"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
          Apple
        </button>

        <button
          type="button"
          onClick={() => toast.success("Redirecting to Microsoft secure authentication...")}
          className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-full border border-zinc-100 dark:border-zinc-950 bg-transparent hover:bg-zinc-50 dark:hover:bg-zinc-950/50 text-[11px] font-bold text-zinc-800 dark:text-zinc-200 transition-all duration-300 active:scale-95 cursor-pointer"
        >
          <img
            src="/assets/auth/logos/microsoft.svg"
            alt="Microsoft"
            className="h-5 w-5 shrink-0 select-none"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
          Microsoft
        </button>
      </div>

      <div className="text-center mt-2">
        <span className="text-xs text-zinc-500">
          {t("auth.noAccountPrompt")}{" "}
          <Link
            href="/register"
            className="text-zinc-900 dark:text-zinc-100 hover:underline font-bold transition-all ml-1"
          >
            {t("auth.switchToRegister")}
          </Link>
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
  const guard = useSubmitGuard();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PasswordFormValues>({
    resolver: zodResolver(getPasswordSchema(t)),
  });

  const onSubmit = async (data: PasswordFormValues) => {
    if (!guard.enter()) return;
    setServerError(null);
    try {
      await authService.login(identity, data.password);
      toast.success(t("auth.toastLoginSuccess"));
      router.push("/");
    } catch (error) {
      setServerError(t(authErrorKey(error)));
    } finally {
      guard.leave();
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5 w-full">
      <div className="text-center md:text-left">
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          {t("auth.loginTitle")}
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
          {t("auth.editIdentity")}
        </button>
      </div>

      <div className="border-b border-zinc-200 dark:border-zinc-800 py-3 flex flex-col gap-2 transition-colors focus-within:border-zinc-950 dark:focus-within:border-zinc-200">
        <label className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
          {t("auth.passwordLabel")}
        </label>
        <input
          {...register("password")}
          type="password"
          placeholder={t("auth.passwordPlaceholder")}
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
      {serverError && (
        <span role="alert" className="text-xs text-red-500 -mt-2 animate-fade-in font-medium">
          {serverError}
        </span>
      )}

      <div className="text-right -mt-1">
        <button
          type="button"
          onClick={onForgotPassword}
          className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:underline"
        >
          {t("auth.forgotPasswordPrompt")}
        </button>
      </div>

      <Button
        type="submit"
        className="rounded-full w-full py-3.5 bg-black text-white hover:bg-zinc-900 dark:bg-white dark:text-black dark:hover:bg-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-sm transition-all duration-300 h-auto"
      >
        {isSubmitting ? (
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="animate-spin size-4" />
            <span>{t("auth.loggingIn")}</span>
          </div>
        ) : (
          t("auth.loginSubmit")
        )}
      </Button>

      <div className="text-center mt-2">
        <button
          type="button"
          onClick={onBack}
          className="text-xs font-bold text-zinc-500 hover:underline hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          {t("auth.backToLogin")}
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
  const guard = useSubmitGuard();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotFormValues>({
    resolver: zodResolver(getForgotSchema(t)),
    defaultValues: { email: defaultEmail },
  });

  const onSubmit = async (data: ForgotFormValues) => {
    if (!guard.enter()) return;
    setServerError(null);
    try {
      await authService.forgotPassword(data.email);
      toast.success(t("auth.toastOtpSent"));
      onSent(data.email);
    } catch (error) {
      setServerError(t(authErrorKey(error)));
    } finally {
      guard.leave();
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5 w-full">
      <div className="text-center md:text-left">
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          {t("auth.forgotPasswordPrompt")}
        </h2>
      </div>

      <div className="border-b border-zinc-200 dark:border-zinc-800 py-3 flex flex-col gap-2 transition-colors focus-within:border-zinc-950 dark:focus-within:border-zinc-200">
        <label className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
          {t("auth.emailLabel")}
        </label>
        <input
          {...register("email")}
          type="email"
          placeholder={t("auth.emailPlaceholder")}
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
      {serverError && (
        <span role="alert" className="text-xs text-red-500 -mt-2 animate-fade-in font-medium">
          {serverError}
        </span>
      )}

      <Button
        type="submit"
        className="rounded-full w-full py-3.5 bg-black text-white hover:bg-zinc-900 dark:bg-white dark:text-black dark:hover:bg-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-sm transition-all duration-300 h-auto"
      >
        {isSubmitting ? (
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="animate-spin size-4" />
            <span>{t("auth.sendingOtp")}</span>
          </div>
        ) : (
          t("auth.sendOtp")
        )}
      </Button>

      <div className="text-center mt-2">
        <button
          type="button"
          onClick={onBack}
          className="text-xs font-bold text-zinc-500 hover:underline hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          {t("auth.backToLogin")}
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
  const guard = useSubmitGuard();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetFormValues>({
    resolver: zodResolver(getResetSchema(t)),
  });

  const onSubmit = async (data: ResetFormValues) => {
    if (!guard.enter()) return;
    setServerError(null);
    try {
      await authService.resetPassword({ loginId: email, otp: data.otp, newPassword: data.newPassword });
      toast.success(t("auth.toastResetSuccess"));
      onSuccess();
    } catch (error) {
      setServerError(t(authErrorKey(error)));
    } finally {
      guard.leave();
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5 w-full">
      <div className="text-center md:text-left">
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          {t("auth.resetPassword")}
        </h2>
      </div>

      {/* Informative Email Lock-in Banner */}
      <div className="w-full bg-zinc-50 dark:bg-zinc-950 py-2 px-4 rounded-xl border border-zinc-100 dark:border-zinc-900 text-xs text-zinc-500 font-semibold truncate">
        OTP sent to: {email}
      </div>

      {/* OTP Input */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 py-3 flex flex-col gap-2 transition-colors focus-within:border-zinc-950 dark:focus-within:border-zinc-200">
        <label className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
          {t("auth.otpLabel")}
        </label>
        <input
          {...register("otp")}
          placeholder={t("auth.otpPlaceholder")}
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
          {t("auth.newPasswordLabel")}
        </label>
        <input
          {...register("newPassword")}
          type="password"
          placeholder={t("auth.newPasswordPlaceholder")}
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
          {t("auth.confirmNewPasswordLabel")}
        </label>
        <input
          {...register("confirmNewPassword")}
          type="password"
          placeholder={t("auth.confirmNewPasswordPlaceholder")}
          className="bg-transparent border-none outline-none focus:outline-none w-full text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-700"
          disabled={isSubmitting}
        />
      </div>
      {errors.confirmNewPassword && (
        <span className="text-xs text-red-500 -mt-2 animate-fade-in font-medium">
          {errors.confirmNewPassword.message}
        </span>
      )}
      {serverError && (
        <span role="alert" className="text-xs text-red-500 -mt-2 animate-fade-in font-medium">
          {serverError}
        </span>
      )}

      <Button
        type="submit"
        className="rounded-full w-full py-3.5 bg-black text-white hover:bg-zinc-900 dark:bg-white dark:text-black dark:hover:bg-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-sm transition-all duration-300 h-auto"
      >
        {isSubmitting ? (
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="animate-spin size-4" />
            <span>{t("auth.resettingPassword")}</span>
          </div>
        ) : (
          t("auth.resetPassword")
        )}
      </Button>

      <div className="text-center mt-2">
        <button
          type="button"
          onClick={onBack}
          className="text-xs font-bold text-zinc-500 hover:underline hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          {t("auth.backToLogin")}
        </button>
      </div>
    </form>
  );
};

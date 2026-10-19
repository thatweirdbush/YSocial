"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useTranslation } from "@/hooks/use-translation";
import { hasCode } from "@/lib/api-error";
import { Button } from "@/components/ui/button";
import { useSubmitGuard } from "../hooks/use-submit-guard";
import { authService, RegisteredLoginFailedError } from "../services/auth-service";
import { authErrorKey, authFieldErrors } from "../utils/auth-error";
import { getRegisterSchema, RegisterFormValues } from "../types";

export const RegisterForm: React.FC = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const guard = useSubmitGuard();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(getRegisterSchema(t)),
  });

  const onSubmit = async (data: RegisterFormValues) => {
    if (!guard.enter()) return;
    setServerError(null);
    try {
      await authService.register({ email: data.email, password: data.password, username: data.username });
      toast.success(t("auth.toastRegisterSuccess"));
      router.push("/");
    } catch (error) {
      if (error instanceof RegisteredLoginFailedError) {
        toast.success(t("auth.registeredPleaseLogin"));
        router.push("/login");
        return;
      }
      const message = t(authErrorKey(error));
      const fieldErrors = authFieldErrors(error);
      const formFields: Array<keyof RegisterFormValues> = ["email", "username", "password"];
      const invalid = formFields.filter((field) => fieldErrors[field]);
      if (invalid.length > 0) {
        for (const field of invalid) setError(field, { message: fieldErrors[field] });
      } else if (hasCode(error, "UsernameTaken")) {
        setError("username", { message });
      } else if (hasCode(error, "EmailTaken")) {
        setError("email", { message });
      } else {
        setServerError(message);
      }
    } finally {
      guard.leave();
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5 w-full">
      <div className="text-center md:text-left">
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          {t("auth.registerTitle")}
        </h2>
      </div>

      {/* Email Input */}
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

      {/* Username Input */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 py-3 flex flex-col gap-2 transition-colors focus-within:border-zinc-950 dark:focus-within:border-zinc-200">
        <label className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
          {t("auth.usernameLabel")}
        </label>
        <input
          {...register("username")}
          placeholder={t("auth.usernamePlaceholder")}
          className="bg-transparent border-none outline-none focus:outline-none w-full text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-700"
          disabled={isSubmitting}
        />
      </div>
      {errors.username && (
        <span className="text-xs text-red-500 -mt-2 animate-fade-in font-medium">
          {errors.username.message}
        </span>
      )}

      {/* Password Input */}
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
        />
      </div>
      {errors.password && (
        <span className="text-xs text-red-500 -mt-2 animate-fade-in font-medium">
          {errors.password.message}
        </span>
      )}

      {/* Confirm Password Input */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 py-3 flex flex-col gap-2 transition-colors focus-within:border-zinc-950 dark:focus-within:border-zinc-200">
        <label className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
          {t("auth.confirmPasswordLabel")}
        </label>
        <input
          {...register("confirmPassword")}
          type="password"
          placeholder={t("auth.confirmPasswordPlaceholder")}
          className="bg-transparent border-none outline-none focus:outline-none w-full text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-700"
          disabled={isSubmitting}
        />
      </div>
      {errors.confirmPassword && (
        <span className="text-xs text-red-500 -mt-2 animate-fade-in font-medium">
          {errors.confirmPassword.message}
        </span>
      )}
      {serverError && (
        <span role="alert" className="text-xs text-red-500 -mt-2 animate-fade-in font-medium">
          {serverError}
        </span>
      )}

      <Button
        type="submit"
        className="rounded-full w-full py-3.5 bg-black text-white hover:bg-zinc-900 dark:bg-white dark:text-black dark:hover:bg-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-sm transition-all duration-300 h-auto mt-2"
      >
        {isSubmitting ? (
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="animate-spin size-4" />
            <span>{t("auth.registering")}</span>
          </div>
        ) : (
          t("auth.registerSubmit")
        )}
      </Button>

      <div className="text-center mt-2">
        <span className="text-xs text-zinc-500">
          {t("auth.haveAccountPrompt")}{" "}
          <Link
            href="/login"
            className="text-zinc-900 dark:text-zinc-100 hover:underline font-bold transition-all ml-1"
          >
            {t("auth.switchToLogin")}
          </Link>
        </span>
      </div>
    </form>
  );
};

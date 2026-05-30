"use client";

import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useTranslation } from "@/hooks/use-translation";
import { useAuthActions } from "@/features/auth/store/auth-store";
import { Button } from "@/components/ui/button";
import { getRegisterSchema, RegisterFormValues } from "../types";

export const RegisterForm: React.FC = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { setTokens, updateUser } = useAuthActions();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(getRegisterSchema(t)),
  });

  const onSubmit = async (data: RegisterFormValues) => {
    // Simulate high-fidelity register transaction
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Auto-login after successful mock registration
    setTokens("mock_access_token", "mock_refresh_token");
    updateUser({
      id: "2",
      email: data.email,
      displayName: data.username,
      username: data.username.toLowerCase(),
      bio: "Just joined the YSocial ecosystem!",
    });

    toast.success(t("auth.toastRegisterSuccess") || "Account created successfully! Welcome to YSocial.");
    router.push("/");
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5 w-full">
      <div className="text-center md:text-left">
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          {t("auth.registerTitle") || "Create your account"}
        </h2>
      </div>

      {/* Email Input */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 py-3 flex flex-col gap-1 transition-colors focus-within:border-zinc-950 dark:focus-within:border-zinc-200">
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

      {/* Username Input */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 py-3 flex flex-col gap-1 transition-colors focus-within:border-zinc-950 dark:focus-within:border-zinc-200">
        <label className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
          {t("auth.usernameLabel") || "Username"}
        </label>
        <input
          {...register("username")}
          placeholder={t("auth.usernamePlaceholder") || "Choose a username"}
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
      <div className="border-b border-zinc-200 dark:border-zinc-800 py-3 flex flex-col gap-1 transition-colors focus-within:border-zinc-950 dark:focus-within:border-zinc-200">
        <label className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
          {t("auth.passwordLabel") || "Password"}
        </label>
        <input
          {...register("password")}
          type="password"
          placeholder={t("auth.passwordPlaceholder") || "Enter your password"}
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
      <div className="border-b border-zinc-200 dark:border-zinc-800 py-3 flex flex-col gap-1 transition-colors focus-within:border-zinc-950 dark:focus-within:border-zinc-200">
        <label className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
          {t("auth.confirmPasswordLabel") || "Confirm Password"}
        </label>
        <input
          {...register("confirmPassword")}
          type="password"
          placeholder={t("auth.confirmPasswordPlaceholder") || "Re-enter your password"}
          className="bg-transparent border-none outline-none focus:outline-none w-full text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-700"
          disabled={isSubmitting}
        />
      </div>
      {errors.confirmPassword && (
        <span className="text-xs text-red-500 -mt-2 animate-fade-in font-medium">
          {errors.confirmPassword.message}
        </span>
      )}

      <Button
        type="submit"
        disabled={isSubmitting}
        className="rounded-full w-full py-3.5 bg-black text-white hover:bg-zinc-900 dark:bg-white dark:text-black dark:hover:bg-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-sm transition-all duration-300 h-auto mt-2"
      >
        {isSubmitting ? (
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="animate-spin size-4" />
            <span>{t("auth.registering") || "Creating account..."}</span>
          </div>
        ) : (
          t("auth.registerSubmit") || "Register"
        )}
      </Button>

      <div className="text-center mt-2">
        <span className="text-xs text-zinc-500">
          {t("auth.haveAccountPrompt") || "Already have an account?"}{" "}
          <a
            href="/login"
            className="text-zinc-900 dark:text-zinc-100 hover:underline font-bold transition-all ml-1"
          >
            {t("auth.switchToLogin") || "Log in here"}
          </a>
        </span>
      </div>
    </form>
  );
};

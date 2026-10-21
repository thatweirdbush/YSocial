"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { FeatureUnavailable } from "@/components/shared/feature-unavailable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { type MeDto, useSubmitGuard } from "@/features/auth";
import { fetchMe } from "@/features/auth/services/auth-service";
import { type TranslationKey, useTranslation } from "@/hooks/use-translation";
import { hasCapability } from "@/lib/capabilities";
import { cn } from "@/lib/utils";
import { useViewerResource } from "../hooks/use-viewer-resource";
import { GENDER_VALUES, type GenderValue, parseGender, saveAccountProfile } from "../services/account-service";
import { isPastBirthDate, maxBirthDate } from "../utils/birth-date";
import { SettingsPageHeader } from "./settings-page-header";

const GENDER_LABELS: Record<GenderValue, TranslationKey> = {
  unspecified: "settings.genderUnspecified",
  male: "settings.genderMale",
  female: "settings.genderFemale",
  other: "settings.genderOther",
};

const createAccountSchema = (t: (key: TranslationKey) => string, birthDateRequired: boolean) =>
  z.object({
    gender: z.enum(GENDER_VALUES as [GenderValue, ...GenderValue[]]),
    // The BE reads a missing birth date as "keep stored", so a stored one can be changed but not cleared
    dateOfBirth: z.string().refine((value) => (value === "" ? !birthDateRequired : isPastBirthDate(value)), t("settings.birthDateInvalid")),
  });

type AccountFormValues = z.infer<ReturnType<typeof createAccountSchema>>;

const fieldClass = "h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

/** `/settings/account`: email & username (read-only), gender & birth date. Real BE only (no mock adapter). */
export function AccountSection() {
  if (!hasCapability("accountUi")) return <FeatureUnavailable />;
  return <AccountLoader />;
}

function AccountLoader() {
  const { t } = useTranslation();
  const { state, key, retry } = useViewerResource(fetchMe);

  return (
    <>
      <SettingsPageHeader title="settings.account" />
      {state.status === "loading" && (
        <section className="flex flex-col gap-6 p-4" role="status" aria-busy="true">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </section>
      )}
      {state.status === "error" && (
        <section className="flex flex-col items-center gap-4 px-4 py-16 text-center">
          <p className="text-sm font-medium text-zinc-400 dark:text-zinc-500">{t("settings.loadFailed")}</p>
          <Button type="button" variant="outline" onClick={retry} className="min-h-11 rounded-full px-5">
            {t("settings.retry")}
          </Button>
        </section>
      )}
      {state.status === "ready" && <AccountForm key={key} initial={state.data} />}
    </>
  );
}

function AccountForm({ initial }: { initial: MeDto }) {
  const { t } = useTranslation();
  const guard = useSubmitGuard();
  const [me, setMe] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [maxDate] = useState(() => maxBirthDate());
  const birthDateRequired = Boolean(me.dateOfBirth);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AccountFormValues>({
    resolver: zodResolver(createAccountSchema(t, birthDateRequired)),
    defaultValues: { gender: parseGender(initial.gender), dateOfBirth: initial.dateOfBirth ?? "" },
  });

  const onSubmit = async (values: AccountFormValues) => {
    if (!guard.enter()) return;
    setSaving(true);
    try {
      await saveAccountProfile(me, { gender: values.gender, dateOfBirth: values.dateOfBirth || null });
      // The saved values are the new snapshot (the next save re-sends them)
      setMe({ ...me, gender: values.gender, dateOfBirth: values.dateOfBirth || me.dateOfBirth });
      reset(values);
      toast.success(t("settings.saved"));
    } catch {
      toast.error(t("settings.saveFailed"));
    } finally {
      guard.leave();
      setSaving(false);
    }
  };

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5 p-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="account-email" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          {t("settings.email")}
        </label>
        <Input id="account-email" readOnly value={me.email ?? ""} className="h-11" />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="account-username" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          {t("settings.username")}
        </label>
        <Input id="account-username" readOnly value={me.profile?.username ?? ""} aria-describedby="account-username-hint" className="h-11" />
        <p id="account-username-hint" className="text-sm text-zinc-500 dark:text-zinc-400">
          {t("settings.usernameLocked")}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="account-gender" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          {t("settings.gender")}
        </label>
        <select id="account-gender" className={fieldClass} {...register("gender")}>
          {GENDER_VALUES.map((gender) => (
            <option key={gender} value={gender}>
              {t(GENDER_LABELS[gender])}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="account-birth-date" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          {t("settings.birthDate")}
        </label>
        <Input
          id="account-birth-date"
          type="date"
          min="1900-01-01"
          max={maxDate}
          aria-invalid={errors.dateOfBirth ? true : undefined}
          aria-describedby={errors.dateOfBirth ? "account-birth-date-error" : undefined}
          className={cn("h-11", errors.dateOfBirth && "border-destructive")}
          {...register("dateOfBirth")}
        />
        {errors.dateOfBirth && (
          <p id="account-birth-date-error" role="alert" className="text-sm text-destructive">
            {errors.dateOfBirth.message}
          </p>
        )}
      </div>

      <Button type="submit" className="min-h-11 self-start rounded-full px-6">
        {saving && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
        {t("settings.save")}
      </Button>
    </form>
  );
}

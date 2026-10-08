"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useActorId, useAuthActions, useAuthUser } from "@/features/auth";
import { useTranslation } from "@/hooks/use-translation";
import type { TranslationKey } from "@/lib/i18n/translate";
import { updateProfile } from "../services/user-service";
import { useUserActions } from "../store/user-store";
import {
  PROFILE_BIO_MAX,
  PROFILE_DISPLAY_NAME_MAX,
  PROFILE_DISPLAY_NAME_MIN,
  type ProfilePatch,
  type UserProfile,
} from "../types";

const createEditProfileSchema = (t: (key: TranslationKey, params?: Record<string, string | number>) => string) =>
  z.object({
    displayName: z
      .string()
      .trim()
      .min(PROFILE_DISPLAY_NAME_MIN, { message: t("profile.errorDisplayNameMin", { n: PROFILE_DISPLAY_NAME_MIN }) })
      .max(PROFILE_DISPLAY_NAME_MAX, { message: t("profile.errorDisplayNameMax", { n: PROFILE_DISPLAY_NAME_MAX }) }),
    bio: z.string().max(PROFILE_BIO_MAX, { message: t("profile.errorBioMax", { n: PROFILE_BIO_MAX }) }),
    avatarUrl: z.union([z.literal(""), z.string().url({ message: t("profile.errorAvatarUrl") })]),
  });

type EditProfileFormValues = z.infer<ReturnType<typeof createEditProfileSchema>>;

interface EditProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserProfile;
}

const LABEL = "pl-1 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400";
const FIELD =
  "rounded-xl border-zinc-200/70 focus-visible:border-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:border-zinc-900 dark:bg-black";

export function EditProfileDialog({ open, onOpenChange, user }: EditProfileDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-50 w-[95vw] max-w-md rounded-3xl border-zinc-200/50 bg-white p-6 shadow-2xl dark:border-zinc-900 dark:bg-zinc-950">
        <DialogHeader className="mb-4">
          <DialogTitle className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            {t("profile.editProfile")}
          </DialogTitle>
        </DialogHeader>
        {/* Mounted only while open, so every open starts from the user's current values */}
        <EditProfileForm user={user} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function EditProfileForm({ user, onDone }: { user: UserProfile; onDone: () => void }) {
  const { t } = useTranslation();
  const actorId = useActorId();
  const authUser = useAuthUser();
  const { updateUser } = useAuthActions();
  const { patchUser } = useUserActions();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EditProfileFormValues>({
    resolver: zodResolver(createEditProfileSchema(t)),
    defaultValues: { displayName: user.displayName, bio: user.bio ?? "", avatarUrl: user.avatarUrl ?? "" },
  });

  const onSubmit = async (values: EditProfileFormValues) => {
    const patch: ProfilePatch = {
      displayName: values.displayName,
      bio: values.bio || undefined,
      avatarUrl: values.avatarUrl || undefined,
    };
    try {
      await updateProfile(user.id, patch, actorId);
      patchUser(user.id, patch);
      // Keep the sidebar account widget (auth store) in step; the cookie only carries { id, username }
      if (authUser?.id === user.id) updateUser({ ...authUser, ...patch });
      toast.success(t("profile.editSuccess"));
      onDone();
    } catch {
      toast.error(t("profile.editError"));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="edit-display-name" className={LABEL}>
          {t("profile.editDisplayName")}
        </label>
        <Input id="edit-display-name" {...register("displayName")} aria-invalid={!!errors.displayName} className={FIELD} />
        {errors.displayName && <span className="pl-1 text-xs font-semibold text-red-500">{errors.displayName.message}</span>}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="edit-bio" className={LABEL}>
          {t("profile.editBio")}
        </label>
        <Textarea
          id="edit-bio"
          {...register("bio")}
          placeholder={t("profile.editBioPlaceholder")}
          rows={3}
          aria-invalid={!!errors.bio}
          className={`${FIELD} resize-none`}
        />
        {errors.bio && <span className="pl-1 text-xs font-semibold text-red-500">{errors.bio.message}</span>}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="edit-avatar-url" className={LABEL}>
          {t("profile.editAvatarUrl")}
        </label>
        <Input
          id="edit-avatar-url"
          {...register("avatarUrl")}
          placeholder="https://example.com/avatar.jpg"
          aria-invalid={!!errors.avatarUrl}
          className={FIELD}
        />
        {errors.avatarUrl && <span className="pl-1 text-xs font-semibold text-red-500">{errors.avatarUrl.message}</span>}
      </div>

      <div className="flex justify-end gap-3 border-t border-zinc-100 pt-4 dark:border-zinc-900">
        <Button
          type="button"
          variant="ghost"
          onClick={onDone}
          className="min-h-11 rounded-full px-5 py-2 font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-900"
        >
          {t("profile.editCancel")}
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting}
          className="min-h-11 rounded-full bg-black px-6 py-2 font-semibold text-white transition-colors hover:bg-zinc-900 dark:bg-white dark:text-black dark:hover:bg-zinc-100"
        >
          {isSubmitting ? t("profile.editSaving") : t("profile.editSave")}
        </Button>
      </div>
    </form>
  );
}

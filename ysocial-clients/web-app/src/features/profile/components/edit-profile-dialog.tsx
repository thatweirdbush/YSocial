"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useActorId, useAuthActions, useAuthUser } from "@/features/auth";
import { useMediaUploadQueue } from "@/hooks/use-media-upload-queue";
import { useTranslation } from "@/hooks/use-translation";
import { hasCapability } from "@/lib/capabilities";
import { describeMediaProblem } from "@/lib/media/media-messages";
import { kindOfFile } from "@/lib/media/media-limits";
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
/** Avatars are pictures: no videos (the BE refuses them too). */
const AVATAR_ACCEPT = "image/jpeg,image/png,image/gif,image/webp";
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
  const { upsertUsers } = useUserActions();

  // Real BE: the photo is uploaded on select (Pending asset) and saved as `avatarMediaId`; mock mode keeps the url field
  const uploadsReal = hasCapability("mediaUpload");
  const queue = useMediaUploadQueue({
    purpose: "avatar",
    onReject: (rejection) => toast.error(describeMediaProblem(rejection, t)),
  });
  const [avatarRemoved, setAvatarRemoved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const discardRef = useRef(queue.discardAll);

  // Closed any other way than Save (outside click, Escape): the pending upload goes back to the BE.
  // After Save the queue was cleared, so there is nothing left to discard.
  useEffect(() => {
    const discard = discardRef;
    return () => discard.current();
  }, []);

  const picked = queue.items[0];
  const avatarPreview = picked ? picked.previewUrl : avatarRemoved ? undefined : user.avatarUrl;

  const pickPhoto = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;

    if (kindOfFile(file) !== "image") {
      toast.error(describeMediaProblem({ code: "unsupported" }, t));
      return;
    }

    queue.discardAll();
    setAvatarRemoved(false);
    queue.addFiles([file]);
  };

  const removePhoto = () => {
    queue.discardAll();
    setAvatarRemoved(true);
  };

  const cancel = () => {
    queue.discardAll();
    onDone();
  };

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EditProfileFormValues>({
    resolver: zodResolver(createEditProfileSchema(t)),
    defaultValues: { displayName: user.displayName, bio: user.bio ?? "", avatarUrl: user.avatarUrl ?? "" },
  });

  const onSubmit = async (values: EditProfileFormValues) => {
    if (uploadsReal && queue.isBusy) {
      toast.info(t("media.waitUploads"));
      return;
    }
    if (uploadsReal && queue.hasError) {
      toast.error(t("media.fixUploads"));
      return;
    }

    const patch: ProfilePatch = { displayName: values.displayName, bio: values.bio || undefined };
    if (!uploadsReal) {
      patch.avatarUrl = values.avatarUrl || undefined;
    } else if (queue.mediaIds[0]) {
      patch.avatarMediaId = queue.mediaIds[0];
    } else if (!avatarRemoved) {
      // Keep: the stored url is re-sent, omitting it would clear the avatar
      patch.avatarUrl = user.avatarUrl || undefined;
    }

    try {
      const updated = await updateProfile(user.id, patch, actorId);
      queue.clear();
      upsertUsers([updated], actorId);
      // Keep the sidebar account widget (auth store) in step; the cookie only carries { id, username }
      if (authUser?.id === user.id) {
        updateUser({ ...authUser, displayName: updated.displayName, bio: updated.bio, avatarUrl: updated.avatarUrl });
      }
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

      {uploadsReal ? (
        <div className="flex items-center gap-4">
          <UserAvatar src={avatarPreview} name={user.displayName} className="size-20 shrink-0 border border-zinc-200 dark:border-zinc-800" fallbackClassName="text-xl font-bold" />
          <div className="flex flex-col items-start gap-1.5">
            <input ref={fileInputRef} type="file" accept={AVATAR_ACCEPT} onChange={(e) => pickPhoto(e.target.files)} className="hidden" />
            <Button type="button" variant="ghost" onClick={() => fileInputRef.current?.click()} className="min-h-11 rounded-full px-4 font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-900">
              {t("media.avatarChange")}
            </Button>
            {avatarPreview && (
              <Button type="button" variant="ghost" onClick={removePhoto} className="min-h-11 rounded-full px-4 font-semibold text-red-500 hover:bg-zinc-100 dark:hover:bg-zinc-900">
                {t("media.avatarRemove")}
              </Button>
            )}
            {queue.isBusy && (
              <span role="status" className="pl-1 text-xs font-semibold text-zinc-500">
                {t("media.avatarUploading")}
              </span>
            )}
            {picked?.status === "error" && picked.error && (
              <span role="alert" className="pl-1 text-xs font-semibold text-red-500">
                {describeMediaProblem(picked.error, t)}
              </span>
            )}
          </div>
        </div>
      ) : (
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
      )}

      <div className="flex justify-end gap-3 border-t border-zinc-100 pt-4 dark:border-zinc-900">
        <Button
          type="button"
          variant="ghost"
          onClick={cancel}
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

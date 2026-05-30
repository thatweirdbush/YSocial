"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "@/hooks/use-translation";
import { useAuthUser, useAuthActions } from "@/features/auth/store/auth-store";
import { apiClient } from "@/lib/api-client";
import { UserProfile } from "../types";

const editProfileSchema = z.object({
  displayName: z
    .string()
    .min(2, "Tên hiển thị phải từ 2 ký tự trở lên")
    .max(50, "Tên hiển thị tối đa 50 ký tự"),
  bio: z.string().max(160, "Tiểu sử không vượt quá 160 ký tự").optional().or(z.literal("")),
  avatarUrl: z
    .string()
    .url("Đường dẫn ảnh đại diện không hợp lệ")
    .optional()
    .or(z.literal("")),
});

type EditProfileFormValues = z.infer<typeof editProfileSchema>;

interface EditProfileDialogProps {
  profile: UserProfile;
  onUpdate: (updatedProfile: UserProfile) => void;
  children: React.ReactNode;
}

export function EditProfileDialog({ profile, onUpdate, children }: EditProfileDialogProps) {
  const { t } = useTranslation();
  const authUser = useAuthUser();
  const { updateUser } = useAuthActions();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<EditProfileFormValues>({
    resolver: zodResolver(editProfileSchema),
    defaultValues: {
      displayName: profile.displayName || "",
      bio: profile.bio || "",
      avatarUrl: profile.avatarUrl || "",
    },
  });

  const onSubmit = async (values: EditProfileFormValues) => {
    setIsLoading(true);
    try {
      await apiClient.put("/api/users/profiles/me", {
        displayName: values.displayName,
        bio: values.bio || null,
        avatarUrl: values.avatarUrl || null,
        coverUrl: profile.coverUrl || null,
        gender: 0, // Unspecified
        dateOfBirth: null,
      });

      const updated: UserProfile = {
        ...profile,
        displayName: values.displayName,
        bio: values.bio || undefined,
        avatarUrl: values.avatarUrl || undefined,
      };

      // Update local parent view state
      onUpdate(updated);

      // If editing self, update global auth store
      if (authUser && authUser.id === profile.id) {
        updateUser({
          ...authUser,
          displayName: values.displayName,
          bio: values.bio || undefined,
          avatarUrl: values.avatarUrl || undefined,
        });
      }

      toast.success("Cập nhật trang cá nhân thành công!");
      setOpen(false);
    } catch (err: any) {
      toast.error(err?.detail || err?.title || "Không thể cập nhật trang cá nhân. Vui lòng thử lại!");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => {
      setOpen(next);
      if (!next) reset(); // Reset form to default values on close
    }}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-md w-[95vw] rounded-3xl p-6 border-zinc-200/50 dark:border-zinc-900 bg-white dark:bg-zinc-950 shadow-2xl z-50">
        <DialogHeader className="mb-4">
          <DialogTitle className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Chỉnh sửa trang cá nhân
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-450 pl-1 uppercase tracking-wider">
              Tên hiển thị
            </label>
            <Input
              {...register("displayName")}
              placeholder="Tên đầy đủ của bạn"
              className="rounded-xl border-zinc-200/70 dark:border-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:border-zinc-450 focus-visible:ring-zinc-450 dark:bg-black"
            />
            {errors.displayName && (
              <span className="text-xs font-semibold text-red-500 pl-1">
                {errors.displayName.message}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-450 pl-1 uppercase tracking-wider">
              Tiểu sử
            </label>
            <Textarea
              {...register("bio")}
              placeholder="Viết đôi điều về bản thân bạn..."
              rows={3}
              className="rounded-xl border-zinc-200/70 dark:border-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:border-zinc-450 focus-visible:ring-zinc-450 dark:bg-black resize-none"
            />
            {errors.bio && (
              <span className="text-xs font-semibold text-red-500 pl-1">
                {errors.bio.message}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-450 pl-1 uppercase tracking-wider">
              Ảnh đại diện (URL)
            </label>
            <Input
              {...register("avatarUrl")}
              placeholder="https://example.com/avatar.jpg"
              className="rounded-xl border-zinc-200/70 dark:border-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:border-zinc-450 focus-visible:ring-zinc-450 dark:bg-black"
            />
            {errors.avatarUrl && (
              <span className="text-xs font-semibold text-red-500 pl-1">
                {errors.avatarUrl.message}
              </span>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-900">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              className="rounded-full px-5 py-2 font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
              Hủy
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="rounded-full px-6 py-2 font-semibold bg-black dark:bg-white text-white dark:text-black hover:bg-zinc-900 dark:hover:bg-zinc-100 transition-colors"
            >
              {isLoading ? "Đang lưu..." : "Lưu thay đổi"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

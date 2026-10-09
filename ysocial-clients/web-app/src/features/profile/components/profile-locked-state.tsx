"use client";

import { Ban, Lock, UserX } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/use-translation";

interface ProfileLockedStateProps {
  /** private: viewer may not see the tabs; blocked: viewer blocked the user; unavailable: the user blocked the viewer. */
  variant: "private" | "blocked" | "unavailable";
  username: string;
  /** Required for the `blocked` variant. */
  onUnblock?: () => void;
}

/** Placeholder for a profile body (or a whole profile) the viewer cannot see. */
export function ProfileLockedState({ variant, username, onUnblock }: ProfileLockedStateProps) {
  const { t } = useTranslation();

  if (variant === "blocked") {
    return (
      <EmptyState
        icon={Ban}
        title={t("relations.blockedTitle", { username })}
        action={
          onUnblock && (
            <Button type="button" variant="outline" onClick={onUnblock} className="min-h-11 rounded-full px-5">
              {t("relations.unblock")}
            </Button>
          )
        }
      />
    );
  }
  if (variant === "unavailable") {
    return <EmptyState icon={UserX} title={t("relations.unavailableTitle")} description={t("relations.unavailableDescription")} />;
  }
  return <EmptyState icon={Lock} title={t("relations.privateTitle")} description={t("relations.privateDescription")} />;
}

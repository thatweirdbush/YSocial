"use client";

import Link from "next/link";
import { CornerUpLeft } from "lucide-react";
import type { ParentReference } from "@/features/posts/types";
import { useTranslation } from "@/hooks/use-translation";

/** One line above a reply on the Replies tab: who it answers, or a notice that the parent is gone. */
export function ReplyContext({ parent }: { parent: ParentReference }) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-1.5 px-4 pt-3 text-xs text-zinc-500 dark:text-zinc-400">
      <CornerUpLeft className="size-3.5 shrink-0" aria-hidden="true" />
      {parent.deleted || !parent.author ? (
        <span>{t("profile.parentDeleted")}</span>
      ) : (
        <Link href={`/posts/${parent.id}`} className="truncate font-medium hover:underline">
          {t("profile.replyingTo", { username: parent.author.username })}
        </Link>
      )}
    </div>
  );
}

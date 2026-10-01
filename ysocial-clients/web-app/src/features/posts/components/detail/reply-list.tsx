"use client";

import { MessageCircle } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { useTranslation } from "@/hooks/use-translation";
import { useReplyIds } from "../../store/post-store";
import { ReplyItem } from "./reply-item";

export function ReplyList({ parentId }: { parentId: string }) {
  const { t } = useTranslation();
  const replyIds = useReplyIds(parentId);

  if (replyIds.length === 0) {
    return <EmptyState icon={MessageCircle} title={t("postDetail.emptyReplies")} />;
  }

  return (
    <div className="flex flex-col">
      {replyIds.map((id) => (
        <ReplyItem key={id} replyId={id} />
      ))}
    </div>
  );
}

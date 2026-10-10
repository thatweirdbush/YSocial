"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useActorId } from "@/features/auth";
import { useTranslation } from "@/hooks/use-translation";
import { fetchBlockedUsers } from "../services/relation-service";
import { commitBlock } from "../store/relation-store";
import type { RelationListQuery } from "../types";
import { RelationUserList } from "./relation-user-list";

/** Users the viewer blocked; Unblock removes the row at once and puts it back if the write fails. */
export function BlockedUserList() {
  const { t } = useTranslation();
  const actorId = useActorId();
  const fetchPage = useCallback((query: RelationListQuery) => fetchBlockedUsers(query, actorId), [actorId]);

  return (
    <RelationUserList
      fetchPage={fetchPage}
      emptyTitle="relations.blockedEmptyTitle"
      emptyDescription="relations.blockedEmptyDescription"
      searchLabel="relations.searchPlaceholder"
      renderAction={(user, { removeRow }) => (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11 rounded-full px-4 text-xs font-bold"
          onClick={() => {
            const undo = removeRow(user.id);
            void commitBlock(actorId, user.id, false).then((ok) => {
              if (ok) {
                toast.success(t("relations.unblockedToast", { username: user.username }));
              } else {
                undo();
                toast.error(t("relations.actionError"));
              }
            });
          }}
        >
          {t("relations.unblock")}
        </Button>
      )}
    />
  );
}

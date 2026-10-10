"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useActorId } from "@/features/auth";
import { useTranslation } from "@/hooks/use-translation";
import { fetchMutedUsers } from "../services/relation-service";
import { commitMute } from "../store/relation-store";
import type { RelationListQuery } from "../types";
import { RelationUserList } from "./relation-user-list";

/** Users the viewer muted; Unmute removes the row at once and puts it back if the write fails. */
export function MutedUserList() {
  const { t } = useTranslation();
  const actorId = useActorId();
  const fetchPage = useCallback((query: RelationListQuery) => fetchMutedUsers(query, actorId), [actorId]);

  return (
    <RelationUserList
      fetchPage={fetchPage}
      emptyTitle="relations.mutedEmptyTitle"
      emptyDescription="relations.mutedEmptyDescription"
      searchLabel="relations.searchPlaceholder"
      renderAction={(user, { removeRow }) => (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11 rounded-full px-4 text-xs font-bold"
          onClick={() => {
            const undo = removeRow(user.id);
            void commitMute(actorId, user.id, false).then((ok) => {
              if (ok) {
                toast.info(t("relations.unmuteToast", { username: user.username }));
              } else {
                undo();
                toast.error(t("relations.actionError"));
              }
            });
          }}
        >
          {t("relations.unmuteAction")}
        </Button>
      )}
    />
  );
}

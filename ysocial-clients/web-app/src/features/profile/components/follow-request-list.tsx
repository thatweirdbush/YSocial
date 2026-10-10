"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useActorId } from "@/features/auth";
import { useTranslation } from "@/hooks/use-translation";
import { fetchFollowRequests } from "../services/relation-service";
import { commitRespondRequest, useFollowRequestsVersion } from "../store/relation-store";
import type { RelationListQuery, RequestDecision } from "../types";
import { RelationUserList, type RelationRowControls } from "./relation-user-list";

/**
 * Pending follow requests of the viewer with Confirm / Delete per row. A row leaves at once and comes back if the
 * write fails. The first page reloads when the requests change from outside this list (going public, blocking a
 * requester), never because of this list's own responses.
 */
export function FollowRequestList() {
  const { t } = useTranslation();
  const actorId = useActorId();
  const reloadKey = useFollowRequestsVersion();
  const fetchPage = useCallback((query: RelationListQuery) => fetchFollowRequests(query, actorId), [actorId]);

  const respond = (requesterId: string, decision: RequestDecision, { removeRow }: RelationRowControls) => {
    const undo = removeRow(requesterId);
    void commitRespondRequest(actorId, requesterId, decision).then((ok) => {
      if (ok) return;
      undo();
      toast.error(t("relations.actionError"));
    });
  };

  return (
    <div className="flex flex-col">
      <h2 className="px-4 pt-4 text-base font-bold tracking-tight text-zinc-900 dark:text-zinc-50">{t("relations.requestsTitle")}</h2>
      <RelationUserList
        fetchPage={fetchPage}
        reloadKey={reloadKey}
        emptyTitle="relations.requestsEmptyTitle"
        emptyDescription="relations.requestsEmptyDescription"
        searchLabel="relations.searchPlaceholder"
        renderAction={(user, controls) => (
          <>
            <Button
              type="button"
              size="sm"
              className="min-h-11 rounded-full px-4 text-xs font-bold"
              onClick={() => respond(user.id, "accept", controls)}
            >
              {t("relations.confirm")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11 rounded-full px-4 text-xs font-bold"
              onClick={() => respond(user.id, "decline", controls)}
            >
              {t("relations.delete")}
            </Button>
          </>
        )}
      />
    </div>
  );
}

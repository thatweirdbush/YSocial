"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useActorId } from "@/features/auth";
import { useTranslation } from "@/hooks/use-translation";
import { cn } from "@/lib/utils";
import { fetchCloseFriendCandidates } from "../services/relation-service";
import { useRelationFlags } from "../store/relation-state";
import { commitCloseFriend, useCloseFriendCount, useRelationsLoaded } from "../store/relation-store";
import type { RelationListQuery, UserProfile } from "../types";
import { RelationUserList } from "./relation-user-list";

/** Per-row toggle: the relation store is authoritative once loaded, the listed projection until then. */
function CloseFriendToggle({ user }: { user: UserProfile }) {
  const { t } = useTranslation();
  const actorId = useActorId();
  const loaded = useRelationsLoaded();
  const flags = useRelationFlags(actorId, user.id);
  const pressed = loaded ? flags.markedCloseFriend : user.viewerMarkedCloseFriend;

  const toggle = () => {
    void commitCloseFriend(actorId, user.id, !pressed).then((ok) => {
      if (!ok) toast.error(t("relations.actionError"));
    });
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-pressed={pressed}
      onClick={toggle}
      className={cn(
        "min-h-11 rounded-full px-4 text-xs font-bold",
        pressed && "border-emerald-500 text-emerald-600 dark:text-emerald-400",
      )}
    >
      {t(pressed ? "relations.remove" : "relations.add")}
    </Button>
  );
}

/** Accepted followees with a close friend toggle per row and a count header (spec 2.4). */
export function CloseFriendsList() {
  const { t } = useTranslation();
  const actorId = useActorId();
  const count = useCloseFriendCount();
  const fetchPage = useCallback((query: RelationListQuery) => fetchCloseFriendCandidates(query, actorId), [actorId]);

  return (
    <div className="flex flex-col">
      <p className="px-4 pt-4 text-sm font-semibold text-zinc-500 dark:text-zinc-400">{t("relations.closeFriendsCount", { n: count })}</p>
      <RelationUserList
        fetchPage={fetchPage}
        emptyTitle="relations.closeFriendsEmptyTitle"
        emptyDescription="relations.closeFriendsEmptyDescription"
        searchLabel="relations.searchPlaceholder"
        renderAction={(user) => <CloseFriendToggle user={user} />}
      />
    </div>
  );
}

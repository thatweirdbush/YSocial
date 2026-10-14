"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { GUEST_ACTOR_ID, toMockSession, useActorId, useAuthHydrated, useAuthStore, useAuthUser, useViewerId } from "@/features/auth";
import { useTranslation } from "@/hooks/use-translation";
import { useUIActions } from "@/lib/store/ui-store";
import { ProfileTabPostsProvider, useProfileTabPostsController } from "../hooks/use-profile-tab-posts";
import { commitBlock, ensureRelationSets, useRelationsLoaded } from "../store/relation-store";
import { ensureUserByUsername, ensureViewerUser, useFollowState, useUserByUsername } from "../store/user-store";
import type { FollowListKind, ProfileTab, UserProfile } from "../types";
import { copyProfileLink } from "../utils/share";
import { toViewerUserInput } from "../utils/viewer-user";
import { FollowersDialog } from "./followers-dialog";
import { ProfileHeader } from "./profile-header";
import { ProfileLockedState } from "./profile-locked-state";
import { ProfileSkeleton } from "./profile-skeleton";
import { ProfileTabPanel } from "./profile-tab-panel";
import { ProfileTabs } from "./profile-tabs";
import { ShareProfileDialog } from "./share-profile-dialog";

interface ProfileContainerProps {
  username: string;
}

/**
 * `/@username` client view on mocks. Route-level not-found is the server's job (`page.tsx`); the only "missing"
 * state here is a cookie/localStorage desync. Identity-dependent UI waits for auth hydration (never a not-found flash).
 */
export function ProfileContainer({ username }: ProfileContainerProps) {
  const hydrated = useAuthHydrated();
  return hydrated ? <ProfileLookup username={username} /> : <ProfileSkeleton />;
}

function ProfileLookup({ username }: ProfileContainerProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const authUser = useAuthUser();
  const viewerId = useViewerId();
  const actorId = useActorId();
  const user = useUserByUsername(username);
  const followKnown = useFollowState(user?.id ?? "") !== undefined;

  const wanted = username.toLowerCase();
  const sessionUsername = authUser ? toMockSession(authUser).username : null;
  const lookupKey = `${actorId}:${wanted}`;
  const [missingKey, setMissingKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const signedIn = useAuthStore.getState().user;
    // The signed-in user's own profile shares the ViewerSync promise, so a hard refresh never races it
    const request =
      signedIn && toMockSession(signedIn).username === wanted
        ? ensureViewerUser(toViewerUserInput(signedIn), actorId)
        : ensureUserByUsername(wanted, actorId);
    request
      .then((found) => {
        if (!cancelled) setMissingKey(found ? null : lookupKey);
      })
      .catch(() => {
        if (!cancelled) setMissingKey(lookupKey);
      });
    return () => {
      cancelled = true;
    };
  }, [wanted, actorId, lookupKey, viewerId, sessionUsername]);

  // A cached user without a known follow state for this viewer (account switch) must not render: it would read as "none"
  const isOwn = user !== undefined && viewerId !== null && viewerId === user.id;
  if (user && (isOwn || followKnown)) return <ProfileView user={user} isOwn={isOwn} actorId={actorId} />;

  if (missingKey === lookupKey) {
    return (
      <EmptyState
        icon={RefreshCw}
        title={t("profile.desyncTitle")}
        action={
          <Button type="button" onClick={() => router.refresh()} className="min-h-11 rounded-full px-5">
            {t("profile.desyncAction")}
          </Button>
        }
      />
    );
  }
  return <ProfileSkeleton />;
}

interface ProfileViewProps {
  user: UserProfile;
  isOwn: boolean;
  actorId: string;
}

function ProfileView({ user, isOwn, actorId }: ProfileViewProps) {
  const { t } = useTranslation();
  const { openComposer } = useUIActions();
  const [shareOpen, setShareOpen] = useState(false);
  const controller = useProfileTabPostsController(user.id, actorId);
  const [activeTab, setActiveTab] = useState<ProfileTab>("threads");
  const [followList, setFollowList] = useState<{ open: boolean; kind: FollowListKind }>({ open: false, kind: "followers" });
  const relationsLoaded = useRelationsLoaded();

  // Block state decides what the page shows, so a signed-in viewer waits for the relation sets (never a flash of tabs)
  useEffect(() => {
    ensureRelationSets(actorId).catch(() => undefined);
  }, [actorId]);

  // Saved belongs to the signed-in owner: losing ownership (logout) must not leave it selected
  const tab: ProfileTab = activeTab === "saved" && !isOwn ? "threads" : activeTab;

  const handleShare = (action: "copy" | "qr") => {
    if (action === "qr") {
      setShareOpen(true);
      return;
    }
    void copyProfileLink(user.username).then((ok) => (ok ? toast.success(t("share.copied")) : toast.error(t("share.copyFailed"))));
  };

  const unblock = () => {
    void commitBlock(actorId, user.id, false).then((ok) => {
      if (ok) toast.success(t("relations.unblockedToast", { username: user.username }));
      else toast.error(t("relations.actionError"));
    });
  };

  if (!(isOwn || actorId === GUEST_ACTOR_ID || relationsLoaded)) return <ProfileSkeleton />;
  // Precedence: blocked by the user > blocked by the viewer > locked private profile > tabs (spec D13, D14)
  if (user.isBlockedBy) return <ProfileLockedState variant="unavailable" username={user.username} />;
  if (user.isBlocked) return <ProfileLockedState variant="blocked" username={user.username} onUnblock={unblock} />;
  const locked = user.isPrivate && !isOwn && user.followStatus !== "accepted";

  return (
    <ProfileTabPostsProvider value={controller}>
      <div className="flex min-h-screen w-full flex-col">
        <ProfileHeader
          user={user}
          isOwn={isOwn}
          canOpenLists={!locked}
          onOpenFollowers={(kind) => setFollowList({ open: true, kind })}
          onShare={handleShare}
        />
        {locked ? (
          <ProfileLockedState variant="private" username={user.username} />
        ) : (
          <>
            <ProfileTabs active={tab} onChange={setActiveTab} showSaved={isOwn} />
            <div className="flex flex-1 flex-col bg-white dark:bg-black">
              <ProfileTabPanel tab={tab} userId={user.id} username={user.username} isOwn={isOwn} onCreatePost={openComposer} />
            </div>
            <FollowersDialog
              open={followList.open}
              onOpenChange={(open) => setFollowList((current) => ({ ...current, open }))}
              userId={user.id}
              initialKind={followList.kind}
              username={user.username}
            />
          </>
        )}
        <ShareProfileDialog open={shareOpen} onOpenChange={setShareOpen} user={user} />
      </div>
    </ProfileTabPostsProvider>
  );
}

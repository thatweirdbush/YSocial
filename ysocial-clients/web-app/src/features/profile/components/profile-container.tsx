"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { toMockSession, useActorId, useAuthHydrated, useAuthStore, useAuthUser, useViewerId } from "@/features/auth";
import { useTranslation } from "@/hooks/use-translation";
import { useUIActions } from "@/lib/store/ui-store";
import { ProfileTabPostsProvider, useProfileTabPostsController } from "../hooks/use-profile-tab-posts";
import { ensureUserByUsername, ensureViewerUser, useUserByUsername } from "../store/user-store";
import type { FollowListKind, ProfileTab, UserProfile } from "../types";
import { copyProfileLink } from "../utils/share";
import { toViewerUserInput } from "../utils/viewer-user";
import { FollowersDialog } from "./followers-dialog";
import { ProfileHeader } from "./profile-header";
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

  if (user) return <ProfileView user={user} isOwn={viewerId !== null && viewerId === user.id} actorId={actorId} />;

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

  // Saved belongs to the signed-in owner: losing ownership (logout) must not leave it selected
  const tab: ProfileTab = activeTab === "saved" && !isOwn ? "threads" : activeTab;

  const handleShare = (action: "copy" | "qr") => {
    if (action === "qr") {
      setShareOpen(true);
      return;
    }
    void copyProfileLink(user.username).then((ok) => (ok ? toast.success(t("share.copied")) : toast.error(t("share.copyFailed"))));
  };

  return (
    <ProfileTabPostsProvider value={controller}>
      <div className="flex min-h-screen w-full flex-col">
        <ProfileHeader
          user={user}
          isOwn={isOwn}
          onOpenFollowers={(kind) => setFollowList({ open: true, kind })}
          onShare={handleShare}
        />
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
        <ShareProfileDialog open={shareOpen} onOpenChange={setShareOpen} user={user} />
      </div>
    </ProfileTabPostsProvider>
  );
}
